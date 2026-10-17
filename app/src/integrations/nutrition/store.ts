import { nowIso, type Queryable, type SqlValue } from "@/db/types";
import { dayTotals } from "@/domain/nutrition/intake";
import { dateOf } from "@/lib/dates";
import { newId } from "@/lib/id";
import {
  editableFoodEntrySchema,
  incomingFoodEntrySchema,
  type DayIntake,
  type EditableFoodEntry,
  type FoodDataSource,
  type FoodEntry,
  type FoodItem,
  type IncomingFoodItem,
} from "./contract";

type EntryRow = {
  id: string;
  source: string;
  external_id: string | null;
  eaten_at: string;
  logged_on: string;
  name: string;
  calories: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  calories_min: number | null;
  calories_max: number | null;
  notes: string | null;
  photo_uri: string | null;
};

type ItemRow = {
  id: string;
  position: number;
  name: string;
  grams: number;
  calories: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  data_source: FoodDataSource;
  matched_name: string | null;
  confidence: number | null;
};

const num = (value: number | null) => (value === null ? null : Number(value));

const mapEntry = (row: EntryRow): FoodEntry => ({
  id: row.id,
  source: row.source,
  externalId: row.external_id,
  eatenAt: row.eaten_at,
  date: row.logged_on,
  name: row.name,
  calories: Number(row.calories),
  proteinG: num(row.protein_g),
  carbsG: num(row.carbs_g),
  fatG: num(row.fat_g),
  fiberG: num(row.fiber_g),
  sugarG: num(row.sugar_g),
  sodiumMg: num(row.sodium_mg),
  caloriesMin: num(row.calories_min),
  caloriesMax: num(row.calories_max),
  notes: row.notes,
  photoUri: row.photo_uri,
});

const mapItem = (row: ItemRow): FoodItem => ({
  id: row.id,
  position: Number(row.position),
  name: row.name,
  grams: Number(row.grams),
  calories: Number(row.calories),
  proteinG: num(row.protein_g),
  carbsG: num(row.carbs_g),
  fatG: num(row.fat_g),
  fiberG: num(row.fiber_g),
  sugarG: num(row.sugar_g),
  sodiumMg: num(row.sodium_mg),
  dataSource: row.data_source,
  matchedName: row.matched_name,
  confidence: num(row.confidence),
});

/** Columnas editables de una comida, en el orden de `entryValues`. */
const ENTRY_COLUMNS = [
  "eaten_at",
  "logged_on",
  "name",
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
  "fiber_g",
  "sugar_g",
  "sodium_mg",
  "calories_min",
  "calories_max",
  "notes",
  "photo_uri",
] as const;

function entryValues(entry: EditableFoodEntry): SqlValue[] {
  return [
    entry.eatenAt,
    entry.date ?? dateOf(entry.eatenAt),
    entry.name,
    entry.calories,
    entry.proteinG ?? null,
    entry.carbsG ?? null,
    entry.fatG ?? null,
    entry.fiberG ?? null,
    entry.sugarG ?? null,
    entry.sodiumMg ?? null,
    entry.caloriesMin ?? null,
    entry.caloriesMax ?? null,
    entry.notes || null,
    entry.photoUri ?? null,
  ];
}

/** Sustituye los alimentos de una comida por los indicados. */
async function replaceItems(db: Queryable, entryId: string, items: IncomingFoodItem[]): Promise<void> {
  await db.run("delete from food_entry_items where food_entry_id = ?", [entryId]);
  for (const [position, item] of items.entries()) {
    await db.run(
      `insert into food_entry_items (id, food_entry_id, position, name, grams, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, data_source, matched_name, confidence)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        entryId,
        position,
        item.name,
        item.grams,
        item.calories,
        item.proteinG ?? null,
        item.carbsG ?? null,
        item.fatG ?? null,
        item.fiberG ?? null,
        item.sugarG ?? null,
        item.sodiumMg ?? null,
        item.dataSource ?? "ai",
        item.matchedName ?? null,
        item.confidence ?? null,
      ],
    );
  }
}

export type SaveResult = {
  saved: number;
  rejected: { index: number; reason: string }[];
  /** Id de cada comida guardada, en el orden en que llegaron (las rechazadas no tienen). */
  ids: string[];
};

/**
 * Guarda comidas: las que se registran en la app (`source` = «foto», «texto», «codigo», «favorita» o
 * «manual») y las que llegasen de otra app. Valida cada una con el contrato; si ya existía una con el
 * mismo `source` y `externalId`, la actualiza (reenviar no duplica) y sustituye sus alimentos.
 */
export async function saveFoodEntries(db: Queryable, source: string, entries: unknown[]): Promise<SaveResult> {
  const result: SaveResult = { saved: 0, rejected: [], ids: [] };
  for (const [index, raw] of entries.entries()) {
    const parsed = incomingFoodEntrySchema.safeParse(raw);
    if (!parsed.success) {
      result.rejected.push({ index, reason: parsed.error.issues[0]?.message ?? "Comida no válida." });
      continue;
    }
    const entry = parsed.data;
    const externalId = entry.externalId ?? newId();
    const now = nowIso();
    await db.run(
      `insert into food_entries (id, source, external_id, ${ENTRY_COLUMNS.join(", ")}, created_at, updated_at)
       values (?, ?, ?, ${ENTRY_COLUMNS.map(() => "?").join(", ")}, ?, ?)
       on conflict (source, external_id) do update set ${ENTRY_COLUMNS.map((column) => `${column} = excluded.${column}`).join(", ")}, updated_at = excluded.updated_at`,
      [newId(), source, externalId, ...entryValues(entry), now, now],
    );
    const row = await db.get<{ id: string }>("select id from food_entries where source = ? and external_id = ?", [source, externalId]);
    if (!row) throw new Error("No se ha podido guardar la comida.");
    if (entry.items) await replaceItems(db, row.id, entry.items);
    result.saved += 1;
    result.ids.push(row.id);
  }
  return result;
}

/** Una comida con sus alimentos, o null si no existe. */
export async function getFoodEntry(db: Queryable, id: string): Promise<FoodEntry | null> {
  const row = await db.get<EntryRow>("select * from food_entries where id = ?", [id]);
  if (!row) return null;
  const items = await db.all<ItemRow>("select * from food_entry_items where food_entry_id = ? order by position", [id]);
  return { ...mapEntry(row), items: items.map(mapItem) };
}

export type EditResult = { ok: true } | { ok: false; error: string };

/** Corrige una comida guardada: sus datos y, si se indican, sus alimentos. Conserva su origen. */
export async function updateFoodEntry(db: Queryable, id: string, raw: unknown): Promise<EditResult> {
  const parsed = editableFoodEntrySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Comida no válida." };
  const entry = parsed.data;
  const outcome = await db.run(
    `update food_entries set ${ENTRY_COLUMNS.map((column) => `${column} = ?`).join(", ")}, updated_at = ? where id = ?`,
    [...entryValues(entry), nowIso(), id],
  );
  if (outcome.changes === 0) return { ok: false, error: "Esa comida ya no existe." };
  if (entry.items) await replaceItems(db, id, entry.items);
  return { ok: true };
}

/**
 * Borra una comida y sus alimentos. Devuelve la ruta de su foto para que quien llama borre también el
 * archivo (la capa de archivos no se usa aquí para poder probar esto sin el teléfono).
 */
export async function deleteFoodEntry(db: Queryable, id: string): Promise<{ deleted: boolean; photoUri: string | null }> {
  const row = await db.get<{ photo_uri: string | null }>("select photo_uri from food_entries where id = ?", [id]);
  if (!row) return { deleted: false, photoUri: null };
  await db.run("delete from food_entries where id = ?", [id]);
  return { deleted: true, photoUri: row.photo_uri };
}

export async function listFoodEntries(db: Queryable, date: string): Promise<FoodEntry[]> {
  const rows = await db.all<EntryRow>("select * from food_entries where logged_on = ? order by eaten_at", [date]);
  return rows.map(mapEntry);
}

/** Comidas entre dos días, ambos incluidos (calendario y resumen semanal). */
export async function listFoodEntriesBetween(db: Queryable, from: string, to: string): Promise<FoodEntry[]> {
  const rows = await db.all<EntryRow>("select * from food_entries where logged_on between ? and ? order by logged_on, eaten_at", [from, to]);
  return rows.map(mapEntry);
}

/** Suma de lo comido en un día. */
export async function getDayIntake(db: Queryable, date: string): Promise<DayIntake> {
  const entries = await listFoodEntries(db, date);
  const totals = dayTotals(entries);
  return {
    date,
    entries,
    calories: totals.calories,
    proteinG: totals.proteinG,
    carbsG: totals.carbsG,
    fatG: totals.fatG,
    fiberG: totals.fiberG,
    sugarG: totals.sugarG,
    sodiumMg: totals.sodiumMg,
  };
}

/**
 * Comidas recientes distintas (mismo nombre y calorías cuentan como la misma), con sus alimentos,
 * para repetirlas con un toque.
 */
export async function listRecentMeals(db: Queryable, limit = 20): Promise<FoodEntry[]> {
  const rows = await db.all<EntryRow>("select * from food_entries order by eaten_at desc limit 200");
  const seen = new Set<string>();
  const out: FoodEntry[] = [];
  for (const row of rows) {
    const key = `${row.name.trim().toLowerCase()}|${Math.round(Number(row.calories))}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = await getFoodEntry(db, row.id);
    if (entry) out.push(entry);
    if (out.length >= limit) break;
  }
  return out;
}

/** Borra las comidas de una fuente (p. ej. al desconectar otra app). */
export async function deleteFoodEntriesFrom(db: Queryable, source: string): Promise<void> {
  await db.run("delete from food_entries where source = ?", [source]);
}
