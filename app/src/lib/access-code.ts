import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Código de acceso al servidor: uno de los de `ACCESS_CODES` en el servidor, uno por persona. Se escribe en
 * Más → Servidor y código de acceso. En el móvil se guarda en el llavero del sistema (expo-secure-store); en
 * la web, en el almacenamiento del navegador.
 *
 * No va dentro del código de la app (como el antiguo `EXPO_PUBLIC_APP_TOKEN`): en la web cualquiera puede
 * leer el código de la app, así que un secreto metido ahí no protege nada.
 */

const KEY = "codigo-acceso";
export const MAX_ACCESS_CODE_LENGTH = 200;

let cached: string | null | undefined;

function read(): string | null {
  try {
    if (Platform.OS === "web") return globalThis.localStorage?.getItem(KEY) ?? null;
    return SecureStore.getItem(KEY);
  } catch {
    return null;
  }
}

/** El código guardado, o null. */
export function getAccessCode(): string | null {
  if (cached === undefined) cached = read();
  return cached;
}

/** Sin espacios alrededor ni dentro (al copiarlo de un mensaje se cuelan). */
export function cleanAccessCode(raw: string): string {
  return raw.replace(/\s+/g, "").slice(0, MAX_ACCESS_CODE_LENGTH);
}

/** Guarda el código (o lo quita con null). Devuelve false si no se ha podido guardar. */
export function setAccessCode(code: string | null): boolean {
  const clean = code ? cleanAccessCode(code) : "";
  try {
    if (Platform.OS === "web") {
      if (clean) globalThis.localStorage?.setItem(KEY, clean);
      else globalThis.localStorage?.removeItem(KEY);
    } else if (clean) {
      SecureStore.setItem(KEY, clean);
    } else {
      void SecureStore.deleteItemAsync(KEY);
    }
    cached = clean || null;
    return true;
  } catch {
    return false;
  }
}
