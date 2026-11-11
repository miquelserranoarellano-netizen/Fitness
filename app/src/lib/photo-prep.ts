import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { ApiError, type PhotoPayload } from "./api";
import { discardTempFile } from "./temp-files";

/**
 * Prepara una foto de comida para analizarla: lado mayor de 1024 px y JPEG al 70 %, en base64. Ahorra
 * datos y coste de IA y quita los metadatos (ubicación incluida). La copia que se guarda en el diario
 * es otra (`data/meal-photos.ts`).
 *
 * Usa Expo: no se prueba con vitest.
 */

const MAX_SIDE = 1024;
const QUALITY = 0.7;

export async function preparePhotoForAnalysis(uri: string, size: { width: number; height: number }): Promise<PhotoPayload> {
  try {
    const context = ImageManipulator.manipulate(uri);
    if (Math.max(size.width, size.height) > MAX_SIDE) {
      // Solo un lado: el otro se ajusta solo. (En la web, `null` en el otro lado rompe el cálculo.)
      context.resize(size.width >= size.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
    }
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: QUALITY, base64: true });
    // Solo hace falta el base64: la copia que deja en la caché sobra.
    discardTempFile(saved.uri);
    if (!saved.base64) throw new Error("La imagen no trae base64.");
    return { base64: saved.base64, mediaType: "image/jpeg" };
  } catch (error) {
    throw new ApiError("prepare", { detail: error instanceof Error ? error.message : String(error) });
  }
}
