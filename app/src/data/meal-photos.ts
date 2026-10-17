import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { Queryable } from "@/db/types";
import { deleteFoodEntry } from "@/integrations/nutrition/store";
import { removeFavorite } from "./favorites";

/**
 * Fotos de las comidas: se guarda una copia reducida (1280 px, JPEG, sin metadatos) en la carpeta
 * privada de la app, como las fotos de progreso. La foto solo sale del teléfono para analizarla en el
 * servidor; aquí se guarda para verla en el diario. Se borra con la comida (salvo que una favorita la
 * use) y con «Borrar todos mis datos».
 *
 * Este módulo usa el sistema de archivos del teléfono: no se prueba con vitest. La parte de base de
 * datos (`store.ts`, `favorites.ts`) sí tiene pruebas.
 */

const MAX_SIDE = 1280;
const FOLDER = "meal-photos";

function mealPhotosDir(): Directory {
  const dir = new Directory(Paths.document, FOLDER);
  dir.create({ idempotent: true, intermediates: true });
  return dir;
}

const isOurs = (uri: string) => uri.includes(`/${FOLDER}/`);

/** Reduce la foto, la copia a la carpeta privada y devuelve su ruta para guardarla con la comida. */
export async function storeMealPhoto(sourceUri: string, size: { width: number; height: number }): Promise<string> {
  const context = ImageManipulator.manipulate(sourceUri);
  if (Math.max(size.width, size.height) > MAX_SIDE) {
    context.resize(size.width >= size.height ? { width: MAX_SIDE, height: null } : { width: null, height: MAX_SIDE });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  const target = new File(mealPhotosDir(), `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
  new File(saved.uri).copy(target);
  return target.uri;
}

/** ¿La usa todavía alguna comida o favorita? */
async function photoInUse(db: Queryable, uri: string): Promise<boolean> {
  const row = await db.get<{ n: number }>(
    "select (select count(*) from food_entries where photo_uri = ?) + (select count(*) from favorite_meals where photo_uri = ?) as n",
    [uri, uri],
  );
  return (row?.n ?? 0) > 0;
}

async function deleteIfUnused(db: Queryable, uri: string | null): Promise<void> {
  if (!uri || !isOurs(uri) || (await photoInUse(db, uri))) return;
  const file = new File(uri);
  if (file.exists) file.delete();
}

/** Borra una comida y, si ya nadie la usa, su foto. */
export async function deleteMeal(db: Queryable, id: string): Promise<boolean> {
  const { deleted, photoUri } = await deleteFoodEntry(db, id);
  await deleteIfUnused(db, photoUri);
  return deleted;
}

/** Quita una favorita y, si ya nadie la usa, su foto. */
export async function deleteFavorite(db: Queryable, id: string): Promise<void> {
  const { photoUri } = await removeFavorite(db, id);
  await deleteIfUnused(db, photoUri);
}

/** Al sustituir la foto de una comida, borra la anterior si ya nadie la usa. */
export async function releaseMealPhoto(db: Queryable, uri: string | null): Promise<void> {
  await deleteIfUnused(db, uri);
}

/** Borra todas las fotos de comidas (con «Borrar todos mis datos»). */
export function deleteAllMealPhotos(): void {
  const dir = new Directory(Paths.document, FOLDER);
  if (dir.exists) dir.delete();
}
