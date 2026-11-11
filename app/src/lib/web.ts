import { Platform } from "react-native";

/**
 * Ayudas solo para la versión web (la de prueba en el VPS). En el móvil no hacen nada.
 */

export const isWeb = Platform.OS === "web";

/** Descarga un archivo JSON (en la web no hay carpeta de la app ni menú de compartir). */
export function downloadJson(fileName: string, data: unknown): void {
  downloadText(fileName, JSON.stringify(data, null, 2), "application/json");
}

/** Descarga un archivo de texto (JSON, CSV…) en el navegador. */
export function downloadText(fileName: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Pide al navegador que no borre los datos de la app si le falta espacio. Los navegadores lo conceden
 * sobre todo a las webs añadidas a la pantalla de inicio. Devuelve si quedan protegidos (null: no se sabe).
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!isWeb) return null;
  try {
    const storage = globalThis.navigator?.storage;
    if (!storage?.persist) return null;
    if (await storage.persisted()) return true;
    return await storage.persist();
  } catch {
    return null;
  }
}
