import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { Queryable } from "@/db/types";
import { deleteFoodEntry } from "@/integrations/nutrition/store";
import { discardTempFile } from "@/lib/temp-files";
import { isWeb } from "@/lib/web";
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

/** Solo nombres que crea esta app (sin «/»): una referencia rara nunca apunta fuera de la carpeta. */
const PHOTO_NAME = /^[\w-]{1,100}\.jpg$/;
const MARKER = `/${FOLDER}/`;

/** Nombre del archivo dentro de la carpeta de fotos de comidas, o null si la ruta no es de esta app. */
function photoName(uri: string): string | null {
  const at = uri.lastIndexOf(MARKER);
  if (at < 0) return null;
  const name = uri.slice(at + MARKER.length);
  return PHOTO_NAME.test(name) ? name : null;
}

/**
 * La foto, buscada por su nombre en la carpeta actual de la app. Se guarda la ruta completa, pero en iOS la
 * carpeta de la app cambia de ruta al actualizarla: con la ruta guardada tal cual, las fotos dejarían de
 * verse y de borrarse.
 */
function ourFile(uri: string): File | null {
  const name = photoName(uri);
  // Sin crear la carpeta: esto se llama al pintar cada miniatura.
  return name ? new File(new Directory(Paths.document, FOLDER), name) : null;
}

/** Dirección para enseñar la foto de una comida (la de su carpeta actual si es nuestra). */
export function mealPhotoDisplayUri(uri: string | null): string | null {
  if (!uri || isWeb) return uri;
  try {
    return ourFile(uri)?.uri ?? uri;
  } catch {
    return uri;
  }
}

/** Reduce la foto, la copia a la carpeta privada y devuelve su ruta para guardarla con la comida. */
export async function storeMealPhoto(sourceUri: string, size: { width: number; height: number }): Promise<string> {
  const context = ImageManipulator.manipulate(sourceUri);
  if (Math.max(size.width, size.height) > MAX_SIDE) {
    context.resize(size.width >= size.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  try {
    const target = new File(mealPhotosDir(), `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
    new File(saved.uri).copy(target);
    return target.uri;
  } finally {
    discardTempFile(saved.uri);
  }
}

/** ¿La usa todavía alguna comida o favorita? Se compara por el nombre, venga de la ruta que venga. */
async function photoInUse(db: Queryable, name: string): Promise<boolean> {
  const suffix = `${MARKER}${name}`;
  const row = await db.get<{ n: number }>(
    `select (select count(*) from food_entries where substr(photo_uri, -length(?)) = ?)
          + (select count(*) from favorite_meals where substr(photo_uri, -length(?)) = ?) as n`,
    [suffix, suffix, suffix, suffix],
  );
  return (row?.n ?? 0) > 0;
}

async function deleteIfUnused(db: Queryable, uri: string | null): Promise<void> {
  if (!uri || isWeb) return;
  const name = photoName(uri);
  if (!name || (await photoInUse(db, name))) return;
  const file = new File(new Directory(Paths.document, FOLDER), name);
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
  if (isWeb) return;
  const dir = new Directory(Paths.document, FOLDER);
  if (dir.exists) dir.delete();
}
