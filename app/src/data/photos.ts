import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { nowIso, type Db, type Queryable } from "@/db/types";
import { newId } from "@/lib/id";
import { discardTempFile } from "@/lib/temp-files";
import { isWeb } from "@/lib/web";
import { setPhotosConsent } from "./profile";

/**
 * Fotografías de progreso: opcionales y privadas. Se reducen a 1600 px y se guardan como JPEG en la
 * carpeta privada de la app (sin metadatos de ubicación); la base de datos solo guarda la referencia.
 * No se analizan de ninguna forma.
 */

export type Pose = "front" | "side" | "back" | "other";

export const POSE_LABEL: Record<Pose, string> = { front: "Frente", side: "Perfil", back: "Espalda", other: "Otra" };

export type PhotoMeta = { id: string; date: string; pose: Pose; uri: string; width: number | null; height: number | null };

const MAX_SIDE = 1600;

function photosDir(): Directory {
  const dir = new Directory(Paths.document, "progress-photos");
  dir.create({ idempotent: true, intermediates: true });
  return dir;
}

export async function listPhotos(db: Queryable): Promise<PhotoMeta[]> {
  const rows = await db.all<{ id: string; taken_on: string; pose: Pose; file_name: string; width: number | null; height: number | null }>(
    "select id, taken_on, pose, file_name, width, height from progress_photos order by taken_on desc, created_at desc",
  );
  const dir = photosDir();
  return rows.map((row) => ({
    id: row.id,
    date: row.taken_on,
    pose: row.pose,
    uri: new File(dir, row.file_name).uri,
    width: row.width,
    height: row.height,
  }));
}

/** Reduce la imagen elegida, la guarda en la carpeta privada y registra la referencia. */
export async function addPhoto(db: Db, input: { sourceUri: string; width: number; height: number; date: string; pose: Pose }): Promise<void> {
  const context = ImageManipulator.manipulate(input.sourceUri);
  const longest = Math.max(input.width, input.height);
  if (longest > MAX_SIDE) {
    context.resize(input.width >= input.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });

  const id = newId();
  const fileName = `${id}.jpg`;
  const target = new File(photosDir(), fileName);
  try {
    new File(saved.uri).copy(target);
    await db.run("insert into progress_photos (id, taken_on, pose, file_name, width, height, created_at) values (?, ?, ?, ?, ?, ?, ?)", [
      id,
      input.date,
      input.pose,
      fileName,
      saved.width,
      saved.height,
      nowIso(),
    ]);
  } catch (error) {
    // Sin referencia en la base de datos, la foto quedaría guardada sin que nadie pudiera verla ni borrarla.
    if (target.exists) target.delete();
    throw error;
  } finally {
    // Fuera las copias de la caché: la del editor y la de la cámara o la galería.
    discardTempFile(saved.uri);
    discardTempFile(input.sourceUri);
  }
}

/** Solo nombres que crea esta app: así una referencia rara nunca borra nada fuera de la carpeta. */
const PHOTO_NAME = /^[\w-]{1,100}\.jpg$/;

export async function deletePhoto(db: Queryable, id: string): Promise<void> {
  const row = await db.get<{ file_name: string }>("select file_name from progress_photos where id = ?", [id]);
  if (!row) return;
  // Primero la referencia: si algo falla después, no queda una foto en la lista que ya no existe.
  await db.run("delete from progress_photos where id = ?", [id]);
  if (!PHOTO_NAME.test(row.file_name)) return;
  const file = new File(photosDir(), row.file_name);
  if (file.exists) file.delete();
}

/** Borra todas las fotografías (referencias y archivos). */
export async function deleteAllPhotos(db: Queryable): Promise<void> {
  await db.run("delete from progress_photos");
  if (isWeb) return;
  const dir = new Directory(Paths.document, "progress-photos");
  if (dir.exists) dir.delete();
}

/** Retirar el permiso borra todas las fotografías. */
export async function revokePhotosConsent(db: Queryable): Promise<void> {
  await deleteAllPhotos(db);
  await setPhotosConsent(db, false);
}
