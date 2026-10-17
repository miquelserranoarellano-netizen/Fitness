import { useCallback, useEffect, useRef, useState } from "react";
import { getProfile } from "@/data/profile";
import { useQuery } from "@/data/provider";
import { avoidList } from "./draft";

/**
 * Peticiones al servidor desde una pantalla: estado (cargando o error), cancelar y cancelar solas al
 * salir de la pantalla. Una petición nueva cancela la anterior.
 */
export type RequestState = { status: "idle" } | { status: "loading" } | { status: "error"; error: unknown };

export function useServerRequest() {
  const controller = useRef<AbortController | null>(null);
  const [state, setState] = useState<RequestState>({ status: "idle" });

  useEffect(() => () => controller.current?.abort(), []);

  const start = useCallback(async <T>(task: (signal: AbortSignal) => Promise<T>): Promise<T | null> => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setState({ status: "loading" });
    try {
      const result = await task(current.signal);
      if (controller.current === current) setState({ status: "idle" });
      return result;
    } catch (error) {
      // Cancelada a propósito (otra petición, «Cancelar» o salir de la pantalla): no es un error.
      if (!current.signal.aborted) setState({ status: "error", error });
      return null;
    }
  }, []);

  const cancel = useCallback(() => {
    controller.current?.abort();
    setState({ status: "idle" });
  }, []);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, start, cancel, reset };
}

/** Alergias y alimentos excluidos del perfil, para que la IA avise si la comida podría llevarlos. */
export function useAvoidList(): string[] {
  const profile = useQuery((db) => getProfile(db));
  return profile.data ? avoidList(profile.data.allergies, profile.data.excludedFoods) : [];
}
