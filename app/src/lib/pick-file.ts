import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { isWeb } from "./web";

export type PickedFile = { name: string; size: number | null; read: () => Promise<string> };

/**
 * Pide un archivo JSON: en la web, el selector del navegador (un `<input type=file>`); en el móvil, el
 * de documentos del sistema (Archivos, Drive…). Devuelve null si se cancela. El contenido se lee
 * aparte con `read()`, para poder comprobar antes el tamaño.
 */
export async function pickJsonFile(): Promise<PickedFile | null> {
  // En Android muchos gestores de archivos no marcan los .json como application/json: se acepta todo
  // y es la importación la que comprueba el contenido.
  const result = await DocumentPicker.getDocumentAsync({ type: isWeb ? ".json,application/json" : "*/*", copyToCacheDirectory: true, base64: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  return {
    name: asset.name,
    size: asset.size ?? null,
    read: async () => {
      if (asset.file) {
        try {
          return await asset.file.text();
        } finally {
          URL.revokeObjectURL(asset.uri);
        }
      }
      const file = new File(asset.uri);
      try {
        return await file.text();
      } finally {
        // Es la copia que el selector deja en la caché: no hace falta guardarla.
        try {
          if (file.exists) file.delete();
        } catch {
          // Si no se puede, el sistema vacía la caché más adelante.
        }
      }
    },
  };
}
