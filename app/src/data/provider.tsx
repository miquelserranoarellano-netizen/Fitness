import * as Crypto from "expo-crypto";
import { useFocusEffect } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Alert } from "react-native";
import { openAppDb } from "@/db/expo";
import type { Db } from "@/db/types";
import { t } from "@/i18n";
import { setIdGenerator } from "@/lib/id";

type DataContext = { db: Db; version: number; invalidate: () => void };

const Context = createContext<DataContext | null>(null);

/**
 * Abre la base de datos del teléfono al arrancar y la comparte con todas las pantallas. `version`
 * cambia tras cada escritura (`invalidate`) y hace que las pantallas abiertas vuelvan a leer sus datos.
 */
export function DataProvider({ children, fallback, onReady }: { children: ReactNode; fallback: ReactNode; onReady?: () => void }) {
  const [db, setDb] = useState<Db | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    setIdGenerator(() => Crypto.randomUUID());
    let cancelled = false;
    openAppDb()
      .then((opened) => {
        if (!cancelled) setDb(opened);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause : new Error(String(cause)));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (db || error) onReady?.();
  }, [db, error, onReady]);

  const invalidate = useCallback(() => setVersion((value) => value + 1), []);

  if (error) throw error;
  if (!db) return <>{fallback}</>;
  return <Context.Provider value={{ db, version, invalidate }}>{children}</Context.Provider>;
}

export function useData(): DataContext {
  const value = useContext(Context);
  if (!value) throw new Error("useData debe usarse dentro de <DataProvider>.");
  return value;
}

export type QueryState<T> = { data: T | undefined; error: Error | null; loading: boolean; reload: () => void };

/**
 * Lee datos de la base local. Se vuelve a ejecutar al cambiar `deps`, al volver a la pantalla y
 * después de cualquier escritura (`invalidate`).
 */
export function useQuery<T>(loader: (db: Db) => Promise<T>, deps: unknown[] = []): QueryState<T> {
  const { db, version } = useData();
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const loaderRef = useRef(loader);
  const firstFocus = useRef(true);

  // Siempre la última versión de `loader`, sin que cada render dispare una lectura nueva.
  useEffect(() => {
    loaderRef.current = loader;
  });

  useFocusEffect(
    useCallback(() => {
      // La primera vez ya carga el efecto de abajo; las siguientes, al volver a la pantalla, se refresca.
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      setFocusTick((value) => value + 1);
    }, []),
  );

  useEffect(() => {
    let cancelled = false;
    // Mientras se vuelve a leer se siguen mostrando los datos anteriores (sin parpadeos).
    loaderRef
      .current(db)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause : new Error(String(cause)));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, version, focusTick, ...deps]);

  const reload = useCallback(() => setFocusTick((value) => value + 1), []);
  return { data, error, loading: data === undefined && error === null, reload };
}

/**
 * Ejecuta una escritura, refresca las pantallas y muestra los errores inesperados. Devuelve el
 * resultado de `task` (o `undefined` si falló).
 */
export function useMutation() {
  const { db, invalidate } = useData();
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async <T,>(task: (db: Db) => Promise<T>): Promise<T | undefined> => {
      setPending(true);
      try {
        const result = await task(db);
        invalidate();
        return result;
      } catch (cause) {
        Alert.alert(t("No se ha podido guardar"), cause instanceof Error ? cause.message : String(cause));
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [db, invalidate],
  );

  return { run, pending };
}
