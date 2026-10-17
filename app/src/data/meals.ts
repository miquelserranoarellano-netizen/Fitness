import type { Db } from "@/db/types";
import { draftToEntry, draftToFavorite, type MealDraft } from "@/features/meals/draft";
import { t } from "@/i18n";
import { saveFoodEntries, updateFoodEntry } from "@/integrations/nutrition/store";
import { addFavorite, markFavoriteUsed, removeFavorite } from "./favorites";

/**
 * Guardar una comida revisada (pantallas de `src/app/comida/`). La foto ya llega guardada en la
 * carpeta de la app (`storeMealPhoto`): aquí solo se escribe la base de datos, así que se prueba con
 * vitest. Todo en una transacción: la comida y su favorita, o nada.
 */

export type SaveMealOptions = {
  name: string;
  eatenAt: string;
  photoUri: string | null;
  /** Guardarla también en favoritas. Si es false y `favoriteIdBefore` existe, se quita de favoritas. */
  favorite: boolean;
  /** La favorita que estaba marcada al abrir la pantalla. */
  favoriteIdBefore?: string | null;
  /** Corregir esta comida en lugar de crear una nueva. */
  entryId?: string;
};

export type SaveMealResult =
  | { ok: true; id: string; favoriteId: string | null; /** Foto de la favorita quitada, para borrarla si nadie la usa. */ releasedPhotoUri: string | null }
  | { ok: false; error: string };

/** Un fallo de validación dentro de la transacción: deshace lo escrito. */
class Rejected extends Error {}

export async function saveMeal(db: Db, draft: MealDraft, options: SaveMealOptions): Promise<SaveMealResult> {
  if (draft.items.length === 0) return { ok: false, error: t("Añade al menos un alimento.") };
  const entry = draftToEntry(draft, options);

  try {
    return await db.transaction(async (tx) => {
      let id: string;
      if (options.entryId) {
        const updated = await updateFoodEntry(tx, options.entryId, entry);
        if (!updated.ok) throw new Rejected(updated.error);
        id = options.entryId;
      } else {
        const saved = await saveFoodEntries(tx, draft.source, [entry]);
        const savedId = saved.ids[0];
        if (!savedId) throw new Rejected(saved.rejected[0]?.reason ?? t("No se ha podido guardar la comida."));
        id = savedId;
      }

      let favoriteId: string | null = null;
      let releasedPhotoUri: string | null = null;
      if (options.favorite) {
        const favorite = await addFavorite(tx, draftToFavorite(draft, options));
        if (!favorite.ok) throw new Rejected(favorite.error);
        await markFavoriteUsed(tx, favorite.id);
        favoriteId = favorite.id;
      } else if (options.favoriteIdBefore) {
        releasedPhotoUri = (await removeFavorite(tx, options.favoriteIdBefore)).photoUri;
      }
      return { ok: true as const, id, favoriteId, releasedPhotoUri };
    });
  } catch (error) {
    if (error instanceof Rejected) return { ok: false, error: error.message };
    throw error;
  }
}
