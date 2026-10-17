import { z } from "zod";
import { json, nowIso, parseJson, type Queryable } from "@/db/types";
import { newId } from "@/lib/id";
import { incomingFoodItemSchema, type IncomingFoodItem } from "@/integrations/nutrition/contract";

/**
 * Comidas favoritas (de SnapCal): se guardan para repetirlas con un toque. Dos comidas con el mismo
 * nombre (sin distinguir mayúsculas) y las mismas calorías son la misma favorita.
 */

export type FavoriteMeal = {
  id: string;
  name: string;
  calories: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
  items: IncomingFoodItem[];
  photoUri: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

const MAX_FAVORITES = 100;

const value = (max: number) => z.number().min(0).max(max).nullable().optional();

export const favoriteInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  calories: z.number().min(0).max(10000),
  proteinG: value(1000),
  carbsG: value(2000),
  fatG: value(1000),
  fiberG: value(500),
  sugarG: value(1000),
  sodiumMg: value(100000),
  items: z.array(incomingFoodItemSchema).max(30).default([]),
  photoUri: z.string().max(1000).nullable().optional(),
});

export type FavoriteInput = z.input<typeof favoriteInputSchema>;

type Row = {
  id: string;
  name: string;
  calories: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  items: string;
  photo_uri: string | null;
  created_at: string;
  last_used_at: string | null;
};

const num = (input: number | null) => (input === null ? null : Number(input));

const mapFavorite = (row: Row): FavoriteMeal => ({
  id: row.id,
  name: row.name,
  calories: Number(row.calories),
  proteinG: num(row.protein_g),
  carbsG: num(row.carbs_g),
  fatG: num(row.fat_g),
  fiberG: num(row.fiber_g),
  sugarG: num(row.sugar_g),
  sodiumMg: num(row.sodium_mg),
  items: parseJson<IncomingFoodItem[]>(row.items, []),
  photoUri: row.photo_uri,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
});

/** Favoritas, las usadas más recientemente primero. */
export async function listFavorites(db: Queryable): Promise<FavoriteMeal[]> {
  const rows = await db.all<Row>("select * from favorite_meals order by coalesce(last_used_at, created_at) desc, rowid desc");
  return rows.map(mapFavorite);
}

/** La favorita que coincide con este nombre y estas calorías, si la hay. */
export async function findFavorite(db: Queryable, name: string, calories: number): Promise<FavoriteMeal | null> {
  const row = await db.get<Row>("select * from favorite_meals where lower(trim(name)) = ? and round(calories) = ?", [name.trim().toLowerCase(), Math.round(calories)]);
  return row ? mapFavorite(row) : null;
}

export type FavoriteResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Guarda una comida como favorita. Si ya lo era, no la duplica. Se conservan las 100 más recientes.
 */
export async function addFavorite(db: Queryable, raw: unknown): Promise<FavoriteResult> {
  const parsed = favoriteInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Favorita no válida." };
  const input = parsed.data;
  const existing = await findFavorite(db, input.name, input.calories);
  if (existing) return { ok: true, id: existing.id };

  const id = newId();
  await db.run(
    `insert into favorite_meals (id, name, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, items, photo_uri, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.calories,
      input.proteinG ?? null,
      input.carbsG ?? null,
      input.fatG ?? null,
      input.fiberG ?? null,
      input.sugarG ?? null,
      input.sodiumMg ?? null,
      json(input.items),
      input.photoUri ?? null,
      nowIso(),
    ],
  );
  await db.run(
    `delete from favorite_meals where id in (
       select id from favorite_meals order by coalesce(last_used_at, created_at) desc, rowid desc limit -1 offset ?
     )`,
    [MAX_FAVORITES],
  );
  return { ok: true, id };
}

/** Quita una favorita. Devuelve la ruta de su foto para borrar el archivo si nadie más la usa. */
export async function removeFavorite(db: Queryable, id: string): Promise<{ photoUri: string | null }> {
  const row = await db.get<{ photo_uri: string | null }>("select photo_uri from favorite_meals where id = ?", [id]);
  await db.run("delete from favorite_meals where id = ?", [id]);
  return { photoUri: row?.photo_uri ?? null };
}

/** Anota que se ha vuelto a usar (sube en la lista). */
export async function markFavoriteUsed(db: Queryable, id: string): Promise<void> {
  await db.run("update favorite_meals set last_used_at = ? where id = ?", [nowIso(), id]);
}
