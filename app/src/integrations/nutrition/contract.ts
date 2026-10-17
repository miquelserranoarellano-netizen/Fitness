import { z } from "zod";
import { isIsoDate } from "@/lib/dates";

/**
 * Contrato de una comida registrada. Lo cumplen las comidas que se registran en la propia app (foto,
 * texto, código de barras, favorita: las pantallas de SnapCal) y las que pudiera mandar otra app. Todas
 * se guardan con `saveFoodEntries` (`store.ts`). Ver `docs/INTEGRACION-NUTRICION.md`.
 *
 * Las cifras de cada alimento vienen del servidor (USDA u Open Food Facts) o, si no hay coincidencia
 * fiable, de la estimación de la IA; la app no las inventa. Los totales de la comida se calculan con
 * `mealTotals` (`src/domain/nutrition/intake.ts`).
 */

const grams = (max: number) => z.number().min(0).max(max);
const optionalGrams = (max: number) => grams(max).nullable().optional();

/** Origen de las cifras de un alimento. */
export const FOOD_DATA_SOURCES = ["usda", "off", "ai", "manual"] as const;
export type FoodDataSource = (typeof FOOD_DATA_SOURCES)[number];

/** Un alimento dentro de una comida. */
export const incomingFoodItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  grams: grams(5000),
  calories: grams(10000),
  proteinG: optionalGrams(1000),
  carbsG: optionalGrams(2000),
  fatG: optionalGrams(1000),
  fiberG: optionalGrams(500),
  sugarG: optionalGrams(1000),
  sodiumMg: optionalGrams(100000),
  dataSource: z.enum(FOOD_DATA_SOURCES).optional(),
  /** Nombre del alimento con el que coincidió en la base de datos. */
  matchedName: z.string().trim().max(200).nullable().optional(),
  /** Seguridad de la IA al reconocerlo (0-1). */
  confidence: z.number().min(0).max(1).nullable().optional(),
});

/** Una comida tal como llega para guardarse. */
export const incomingFoodEntrySchema = z.object({
  /** Identificador en la app de origen: reenviar la misma comida no la duplica. Si falta, se crea uno. */
  externalId: z.string().trim().min(1).max(120).optional(),
  /** Instante en que se comió (ISO 8601, con zona horaria). */
  eatenAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Fecha y hora no válidas."),
  /** Día al que se asigna (AAAA-MM-DD). Si falta, se usa el día local de `eatenAt`. */
  date: z.string().refine(isIsoDate, "Fecha no válida.").optional(),
  /** Nombre del plato o alimento, p. ej. «Arroz con pollo». */
  name: z.string().trim().min(1).max(120),
  calories: grams(10000),
  proteinG: optionalGrams(1000),
  carbsG: optionalGrams(2000),
  fatG: optionalGrams(1000),
  fiberG: optionalGrams(500),
  sugarG: optionalGrams(1000),
  sodiumMg: optionalGrams(100000),
  /** Margen de la estimación de calorías (la foto nunca da un peso exacto). */
  caloriesMin: optionalGrams(10000),
  caloriesMax: optionalGrams(10000),
  /** Observaciones de la IA o del usuario. */
  notes: z.string().trim().max(1000).nullable().optional(),
  /** Ruta local de la foto (opcional). La foto nunca sale del teléfono salvo para analizarla. */
  photoUri: z.string().max(1000).nullable().optional(),
  items: z.array(incomingFoodItemSchema).max(30).optional(),
});

export type IncomingFoodItem = z.infer<typeof incomingFoodItemSchema>;
export type IncomingFoodEntry = z.infer<typeof incomingFoodEntrySchema>;

/** Lo que se puede cambiar de una comida ya guardada (todo salvo su identificador de origen). */
export const editableFoodEntrySchema = incomingFoodEntrySchema.omit({ externalId: true });
export type EditableFoodEntry = z.infer<typeof editableFoodEntrySchema>;

/** Un alimento ya guardado. */
export type FoodItem = {
  id: string;
  position: number;
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
};

/** Una comida ya guardada. `items` solo se carga al pedir una comida concreta. */
export type FoodEntry = {
  id: string;
  /** Cómo se registró: «foto», «texto», «codigo», «favorita», «manual» o el id de una app externa. */
  source: string;
  externalId: string | null;
  eatenAt: string;
  date: string;
  name: string;
  calories: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
  caloriesMin: number | null;
  caloriesMax: number | null;
  notes: string | null;
  photoUri: string | null;
  items?: FoodItem[];
};

/** Lo comido en un día, sumado. Los macros son null si ninguna comida los trae. */
export type DayIntake = {
  date: string;
  entries: FoodEntry[];
  calories: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
};

/**
 * Una fuente externa de comidas (por si en el futuro otra app manda las suyas). Basta con implementar
 * esta interfaz y registrarla en `sources.ts`; el resto de la app ya sabe leer `food_entries`.
 */
export interface NutritionSource {
  /** Identificador estable que se guarda en `food_entries.source`. */
  id: string;
  /** Nombre que se muestra en la pantalla de Nutrición. */
  label: string;
  /** Trae las comidas de un día desde la otra app. */
  fetchDay(date: string): Promise<IncomingFoodEntry[]>;
}

/** Cómo se registró una comida dentro de la app. */
export const IN_APP_SOURCES = ["foto", "texto", "codigo", "favorita", "manual"] as const;
export type InAppSource = (typeof IN_APP_SOURCES)[number];
