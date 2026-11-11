import { Storage } from "expo-sqlite/kv-store";
import { Platform } from "react-native";

/**
 * Permiso para analizar comidas con IA. Antes del primer análisis la app explica qué sale del
 * dispositivo (la foto o el texto y la lista de alergias) y a quién llega (nuestro servidor y Claude,
 * la IA de Anthropic), y pide que se acepte. Sin ese permiso no se envía nada.
 *
 * Se guarda en el dispositivo (como las preferencias de tema e idioma) con la fecha en que se dio, y se
 * puede retirar en Más → Servidor y código de acceso.
 */

const KEY = "permiso-ia";

let cached: boolean | undefined;

function read(): string | null {
  try {
    if (Platform.OS === "web") return globalThis.localStorage?.getItem(KEY) ?? null;
    return Storage.getItemSync(KEY);
  } catch {
    return null;
  }
}

/** ¿Se ha aceptado enviar las comidas a la IA? */
export function hasAiConsent(): boolean {
  if (cached === undefined) cached = Boolean(read());
  return cached;
}

/** Guarda el permiso (con la fecha) o lo retira. */
export function setAiConsent(granted: boolean): void {
  cached = granted;
  try {
    if (Platform.OS === "web") {
      if (granted) globalThis.localStorage?.setItem(KEY, new Date().toISOString());
      else globalThis.localStorage?.removeItem(KEY);
    } else if (granted) {
      Storage.setItemSync(KEY, new Date().toISOString());
    } else {
      Storage.removeItemSync(KEY);
    }
  } catch {
    // Si no se puede guardar, vale hasta cerrar la app y se vuelve a preguntar.
  }
}
