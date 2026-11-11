import { Directory, File, Paths } from "expo-file-system";
import { Image } from "expo-image";
import { isWeb } from "./web";

/**
 * Copias temporales de imágenes. La cámara, la galería y el editor de imágenes dejan copias en la caché de
 * la app (fotos de progreso y de comidas incluidas) que el sistema solo borra cuando le falta espacio. Las
 * fotos que guardamos van a su carpeta; estas copias se quitan en cuanto dejan de hacer falta y todas con
 * «Borrar todos mis datos».
 *
 * Usa el sistema de archivos del teléfono: no se prueba con vitest. En la web no hace nada.
 */

/** Borra un archivo de la caché de la app. Nunca toca nada fuera de ella; si falla, no pasa nada. */
export function discardTempFile(uri: string | null | undefined): void {
  if (isWeb || !uri) return;
  try {
    if (!uri.startsWith(Paths.cache.uri) || uri.includes("/../")) return;
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Una copia temporal que no se puede borrar no impide seguir: el sistema la acabará quitando.
  }
}

/** Vacía la caché de la app (copias de la cámara, la galería y el editor) y la de miniaturas de imágenes. */
export async function clearAppCaches(): Promise<void> {
  if (isWeb) return;
  for (const entry of new Directory(Paths.cache).list()) {
    try {
      entry.delete();
    } catch {
      // Lo que esté en uso se queda; el resto se borra.
    }
  }
  await Promise.allSettled([Image.clearDiskCache(), Image.clearMemoryCache()]);
}
