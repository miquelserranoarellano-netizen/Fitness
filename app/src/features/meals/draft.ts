import type { FavoriteInput, FavoriteMeal } from "@/data/favorites";
import { ALLERGEN_LABEL, type Allergen } from "@/domain/types";
import { mealTotals, scaleItem, type ItemValues, type MealValues } from "@/domain/nutrition/intake";
import { t } from "@/i18n";
import type { FoodDataSource, FoodEntry, InAppSource, IncomingFoodEntry, IncomingFoodItem } from "@/integrations/nutrition/contract";
import type { MealAnalysis } from "@/lib/api";
import { dateOf, today } from "@/lib/dates";
import { parseDecimal } from "@/lib/units";

/**
 * Borrador de una comida mientras se revisa antes de guardarla: lo que ha reconocido la IA (foto o
 * texto), un producto por código de barras, una favorita que se repite o una comida que se corrige.
 * Funciones puras (con pruebas); las pantallas solo las llaman.
 *
 * Al cambiar los gramos de un alimento se recalcula desde sus valores de partida (`base`) con
 * `scaleItem`, para no acumular redondeos. Los totales salen siempre de `mealTotals`.
 */

export type DraftItem = {
  /** Clave para la lista de la pantalla (no se guarda). */
  key: string;
  name: string;
  grams: number;
  calories: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
  dataSource: FoodDataSource;
  matchedName: string | null;
  confidence: number | null;
  /** Cosas que el usuario evita y que la IA cree que podría contener. */
  mayContain: string[];
  /** Valores de partida, para recalcular al cambiar los gramos. */
  base: ItemValues;
};

export type PickedPhoto = { uri: string; width: number; height: number };

export type MealDraft = {
  source: InAppSource;
  name: string;
  items: DraftItem[];
  /** Margen de calorías del análisis y el total al que corresponde. */
  range: { min: number; max: number; total: number } | null;
  notes: string;
  /** Foto recién hecha, todavía sin guardar en la carpeta de la app. */
  newPhoto: PickedPhoto | null;
  /** Foto ya guardada (de una favorita o de la comida que se corrige). */
  photoUri: string | null;
  /** Favorita de la que sale, si sale de una. */
  favoriteId: string | null;
};

let keySeq = 0;
const nextKey = () => `item-${++keySeq}`;

type ItemFields = Omit<DraftItem, "key" | "base" | "mayContain"> & { mayContain?: string[] };

function draftItem(fields: ItemFields): DraftItem {
  const { mayContain = [], ...rest } = fields;
  return {
    ...rest,
    key: nextKey(),
    mayContain,
    base: {
      grams: rest.grams,
      calories: rest.calories,
      proteinG: rest.proteinG,
      carbsG: rest.carbsG,
      fatG: rest.fatG,
      fiberG: rest.fiberG,
      sugarG: rest.sugarG,
      sodiumMg: rest.sodiumMg,
    },
  };
}

const fromStored = (item: IncomingFoodItem): DraftItem =>
  draftItem({
    name: item.name,
    grams: item.grams,
    calories: item.calories,
    proteinG: item.proteinG ?? null,
    carbsG: item.carbsG ?? null,
    fatG: item.fatG ?? null,
    fiberG: item.fiberG ?? null,
    sugarG: item.sugarG ?? null,
    sodiumMg: item.sodiumMg ?? null,
    dataSource: item.dataSource ?? "manual",
    matchedName: item.matchedName ?? null,
    confidence: item.confidence ?? null,
  });

/** Si una comida antigua no tiene alimentos, se representa como uno solo con sus totales. */
const wholeMealItem = (meal: { name: string } & MealValues): DraftItem =>
  draftItem({
    name: meal.name,
    grams: 100,
    calories: meal.calories,
    proteinG: meal.proteinG,
    carbsG: meal.carbsG,
    fatG: meal.fatG,
    fiberG: meal.fiberG,
    sugarG: meal.sugarG,
    sodiumMg: meal.sodiumMg,
    dataSource: "manual",
    matchedName: null,
    confidence: null,
  });

export function emptyDraft(): MealDraft {
  return { source: "manual", name: "", items: [], range: null, notes: "", newPhoto: null, photoUri: null, favoriteId: null };
}

/** Lo que ha devuelto el servidor para una foto, un texto o un código de barras. */
export function draftFromAnalysis(analysis: MealAnalysis, source: "foto" | "texto" | "codigo", photo: PickedPhoto | null = null): MealDraft {
  const items = analysis.items.map((item) =>
    draftItem({
      name: item.name,
      grams: item.grams,
      calories: item.calories,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      fiberG: item.fiberG,
      sugarG: item.sugarG,
      sodiumMg: item.sodiumMg,
      dataSource: item.dataSource,
      matchedName: item.matchedName,
      confidence: item.confidence,
      mayContain: item.mayContain,
    }),
  );
  const total = mealTotals(items).calories;
  const range = analysis.caloriesMax > analysis.caloriesMin && total > 0 ? { min: analysis.caloriesMin, max: analysis.caloriesMax, total } : null;
  return { source, name: analysis.dishName.trim(), items, range, notes: analysis.notes.trim(), newPhoto: photo, photoUri: null, favoriteId: null };
}

/** Repetir una favorita. */
export function draftFromFavorite(favorite: FavoriteMeal): MealDraft {
  return {
    source: "favorita",
    name: favorite.name,
    items: favorite.items.length > 0 ? favorite.items.map(fromStored) : [wholeMealItem(favorite)],
    range: null,
    notes: "",
    newPhoto: null,
    photoUri: favorite.photoUri,
    favoriteId: favorite.id,
  };
}

/**
 * Una comida guardada: para corregirla (`source` = el suyo) o para repetirla desde «Recientes»
 * (`source` = «favorita»).
 */
export function draftFromEntry(entry: FoodEntry, repeat = false): MealDraft {
  const items = entry.items && entry.items.length > 0 ? entry.items.map(fromStored) : [wholeMealItem(entry)];
  const source = repeat ? "favorita" : ((["foto", "texto", "codigo", "favorita", "manual"] as const).find((value) => value === entry.source) ?? "manual");
  const total = mealTotals(items).calories;
  const range =
    !repeat && entry.caloriesMin !== null && entry.caloriesMax !== null && entry.caloriesMax > entry.caloriesMin && total > 0
      ? { min: entry.caloriesMin, max: entry.caloriesMax, total }
      : null;
  return { source, name: entry.name, items, range, notes: repeat ? "" : (entry.notes ?? ""), newPhoto: null, photoUri: entry.photoUri, favoriteId: null };
}

/* ───────────────────────────── Cambios ───────────────────────────── */

export function withGrams(draft: MealDraft, key: string, grams: number): MealDraft {
  return {
    ...draft,
    items: draft.items.map((item) => (item.key === key ? { ...item, ...scaleItem(item.base, grams) } : item)),
  };
}

export function withoutItem(draft: MealDraft, key: string): MealDraft {
  return { ...draft, items: draft.items.filter((item) => item.key !== key) };
}

export function withItem(draft: MealDraft, item: DraftItem): MealDraft {
  return { ...draft, items: [...draft.items, item] };
}

/* ───────────────────────────── Lo que se muestra ───────────────────────────── */

export const draftTotals = (draft: MealDraft): MealValues => mealTotals(draft.items);

/** El margen del análisis, en proporción a lo que se ha cambiado. Null si no hay margen. */
export function draftRange(draft: MealDraft): { min: number; max: number } | null {
  if (!draft.range) return null;
  const ratio = draftTotals(draft).calories / draft.range.total;
  if (!(ratio > 0)) return null;
  return { min: Math.round(draft.range.min * ratio), max: Math.round(draft.range.max * ratio) };
}

/** Lo que la comida podría contener de lo que el usuario evita, sin repetir. */
export function draftWarnings(draft: MealDraft): string[] {
  return [...new Set(draft.items.flatMap((item) => item.mayContain))];
}

/** Nombre que se guarda: el escrito, el del análisis o, si no hay, el del primer alimento. */
export function draftName(draft: MealDraft, typed: string): string {
  return (typed.trim() || draft.name.trim() || draft.items[0]?.name || t("Comida")).slice(0, 120);
}

/* ───────────────────────────── Guardar ───────────────────────────── */

/**
 * Instante de la comida: ahora si es de hoy; el de antes si se corrige sin cambiar el día; y si no,
 * las 12:00 de ese día (hora del teléfono).
 */
export function eatenAtFor(date: string, now: Date, previous?: { date: string; eatenAt: string }): string {
  if (previous && previous.date === date) return previous.eatenAt;
  if (date === today(now)) return now.toISOString();
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12).toISOString();
}

const toStored = (item: DraftItem): IncomingFoodItem => ({
  name: item.name,
  grams: item.grams,
  calories: item.calories,
  proteinG: item.proteinG,
  carbsG: item.carbsG,
  fatG: item.fatG,
  fiberG: item.fiberG,
  sugarG: item.sugarG,
  sodiumMg: item.sodiumMg,
  dataSource: item.dataSource,
  matchedName: item.matchedName,
  confidence: item.confidence,
});

/** La comida tal como se guarda con `saveFoodEntries` o `updateFoodEntry`. */
export function draftToEntry(draft: MealDraft, options: { name: string; eatenAt: string; photoUri: string | null }): IncomingFoodEntry {
  const totals = draftTotals(draft);
  const range = draftRange(draft);
  return {
    eatenAt: options.eatenAt,
    date: dateOf(options.eatenAt),
    name: options.name,
    ...totals,
    caloriesMin: range?.min ?? null,
    caloriesMax: range?.max ?? null,
    notes: draft.notes || null,
    photoUri: options.photoUri,
    items: draft.items.map(toStored),
  };
}

export function draftToFavorite(draft: MealDraft, options: { name: string; photoUri: string | null }): FavoriteInput {
  return { name: options.name, ...draftTotals(draft), items: draft.items.map(toStored), photoUri: options.photoUri };
}

/* ───────────────────────────── Alimento a mano ───────────────────────────── */

export type ManualItemForm = { name: string; grams: string; calories: string; proteinG: string; carbsG: string; fatG: string };

export const emptyManualItem = (): ManualItemForm => ({ name: "", grams: "", calories: "", proteinG: "", carbsG: "", fatG: "" });

/** Valida lo escrito en «Añadir alimento». Los macros son opcionales. */
export function manualItem(form: ManualItemForm): { ok: true; item: DraftItem } | { ok: false; error: string } {
  const name = form.name.trim();
  if (!name) return { ok: false, error: t("Escribe qué has comido.") };
  const grams = parseDecimal(form.grams);
  if (grams === null || grams <= 0 || grams > 5000) return { ok: false, error: t("Indica los gramos (entre 1 y 5000).") };
  const calories = parseDecimal(form.calories);
  if (calories === null || calories < 0 || calories > 10000) return { ok: false, error: t("Indica las calorías (entre 0 y 10 000).") };
  const macro = (input: string, max: number): number | null | "invalid" => {
    if (!input.trim()) return null;
    const value = parseDecimal(input);
    return value === null || value < 0 || value > max ? "invalid" : value;
  };
  const proteinG = macro(form.proteinG, 1000);
  const carbsG = macro(form.carbsG, 2000);
  const fatG = macro(form.fatG, 1000);
  if (proteinG === "invalid" || carbsG === "invalid" || fatG === "invalid") return { ok: false, error: t("Revisa los macros: números de gramos o vacío.") };
  return {
    ok: true,
    item: draftItem({
      name: name.slice(0, 120),
      grams: Math.round(grams),
      calories: Math.round(calories),
      proteinG: proteinG === null ? null : Math.round(proteinG),
      carbsG: carbsG === null ? null : Math.round(carbsG),
      fatG: fatG === null ? null : Math.round(fatG),
      fiberG: null,
      sugarG: null,
      sodiumMg: null,
      dataSource: "manual",
      matchedName: null,
      confidence: null,
    }),
  };
}

/* ───────────────────────────── Lo que se evita ───────────────────────────── */

/**
 * Lista que se manda al servidor para que la IA avise: las alergias del perfil y los alimentos que
 * se excluyen (escritos separados por comas, punto y coma o saltos de línea).
 */
export function avoidList(allergies: readonly Allergen[], excludedFoods: string | null | undefined): string[] {
  const excluded = (excludedFoods ?? "")
    .split(/[,;\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
  const all = [...allergies.map((allergen) => t(ALLERGEN_LABEL[allergen])), ...excluded];
  return [...new Map(all.map((value) => [value.toLowerCase(), value])).values()].slice(0, 20);
}

/* ───────────────────────────── Entre pantallas ───────────────────────────── */

let pending: MealDraft | null = null;

/** Deja un borrador para la pantalla de revisión (las rutas no pasan objetos). */
export function setMealDraft(draft: MealDraft): void {
  pending = draft;
}

/** El borrador pendiente. Se lee al abrir la pantalla de revisión y se borra al salir de ella. */
export function getMealDraft(): MealDraft | null {
  return pending;
}

export function clearMealDraft(): void {
  pending = null;
}
