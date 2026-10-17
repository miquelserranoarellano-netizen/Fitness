import { addDays } from "@/lib/dates";

/**
 * Lo que se come: totales por día, estado de cada día respecto al objetivo, racha de registro, calorías
 * sobrantes y resumen semanal. Viene de SnapCal (`lib/stats.ts`, `lib/weekly.ts` y la pantalla de
 * resultado), pasado a funciones puras con pruebas.
 *
 * Los macros de una comida pueden faltar (`null`): un total es `null` solo si ninguna comida lo trae,
 * para no confundir «0 g» con «sin dato». Fibra, azúcar y sodio igual: solo se muestran si la base de
 * datos nutricional los da.
 */

/* ───────────────────────────── Alimentos de una comida ───────────────────────────── */

export type ItemValues = {
  grams: number;
  calories: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG?: number | null;
  sugarG?: number | null;
  sodiumMg?: number | null;
};

export type MealValues = {
  calories: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
};

const roundTo = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const scaleValue = (value: number | null | undefined, ratio: number, decimals: number): number | null =>
  typeof value === "number" ? roundTo(value * ratio, decimals) : null;

/**
 * Cambia los gramos de un alimento y recalcula sus cifras en proporción a las originales. Se escala
 * siempre desde el valor original (no desde el último editado) para no acumular redondeos.
 */
export function scaleItem<T extends ItemValues>(original: T, grams: number): T {
  const safe = Math.max(0, grams);
  const ratio = safe / Math.max(original.grams, 1);
  return {
    ...original,
    grams: safe,
    calories: Math.round(original.calories * ratio),
    proteinG: scaleValue(original.proteinG, ratio, 0),
    carbsG: scaleValue(original.carbsG, ratio, 0),
    fatG: scaleValue(original.fatG, ratio, 0),
    fiberG: scaleValue(original.fiberG, ratio, 1),
    sugarG: scaleValue(original.sugarG, ratio, 1),
    sodiumMg: scaleValue(original.sodiumMg, ratio, 0),
  };
}

/** Suma de los valores presentes; `null` si ninguno lo trae. */
function sumKnown(values: (number | null | undefined)[], decimals: number): number | null {
  const known = values.filter((value): value is number => typeof value === "number");
  return known.length === 0 ? null : roundTo(known.reduce((total, value) => total + value, 0), decimals);
}

/** Totales de una comida a partir de sus alimentos. */
export function mealTotals(items: ItemValues[]): MealValues {
  return {
    calories: Math.round(items.reduce((total, item) => total + item.calories, 0)),
    proteinG: sumKnown(items.map((item) => item.proteinG), 0),
    carbsG: sumKnown(items.map((item) => item.carbsG), 0),
    fatG: sumKnown(items.map((item) => item.fatG), 0),
    fiberG: sumKnown(items.map((item) => item.fiberG), 1),
    sugarG: sumKnown(items.map((item) => item.sugarG), 1),
    sodiumMg: sumKnown(items.map((item) => item.sodiumMg), 0),
  };
}

/* ───────────────────────────── Días ───────────────────────────── */

/** Lo mínimo de una comida registrada para sumarla. */
export type LoggedMeal = {
  date: string;
  calories: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG?: number | null;
  sugarG?: number | null;
  sodiumMg?: number | null;
};

export type DayTotals = MealValues & { count: number };

export function dayTotals(meals: LoggedMeal[]): DayTotals {
  return {
    calories: Math.round(meals.reduce((total, meal) => total + meal.calories, 0)),
    proteinG: sumKnown(meals.map((meal) => meal.proteinG), 0),
    carbsG: sumKnown(meals.map((meal) => meal.carbsG), 0),
    fatG: sumKnown(meals.map((meal) => meal.fatG), 0),
    fiberG: sumKnown(meals.map((meal) => meal.fiberG), 1),
    sugarG: sumKnown(meals.map((meal) => meal.sugarG), 1),
    sodiumMg: sumKnown(meals.map((meal) => meal.sodiumMg), 0),
    count: meals.length,
  };
}

export function totalsByDate(meals: LoggedMeal[]): Record<string, DayTotals> {
  const byDate = new Map<string, LoggedMeal[]>();
  for (const meal of meals) byDate.set(meal.date, [...(byDate.get(meal.date) ?? []), meal]);
  return Object.fromEntries([...byDate.entries()].map(([date, items]) => [date, dayTotals(items)]));
}

/** Primer día con alguna comida registrada (los anteriores no cuentan como fallados). */
export function firstLogDate(byDate: Record<string, DayTotals>): string | null {
  return (
    Object.keys(byDate)
      .filter((date) => (byDate[date]?.count ?? 0) > 0)
      .sort()[0] ?? null
  );
}

export type DayStatus = "none" | "good" | "bad";

/**
 * Cómo fue un día respecto al objetivo de calorías (de SnapCal):
 * - good: con comidas registradas y sin pasarse más de un 10 %.
 * - bad: se pasó más de un 10 %, o un día ya terminado quedó por debajo de la mitad del objetivo, o no
 *   se registró nada desde que se empezó a usar.
 * - none: futuro, hoy sin registros todavía, o anterior al primer registro.
 */
export function dayStatus(total: DayTotals | undefined, goal: number, context: { date: string; today: string; start: string | null }): DayStatus {
  const { date, today, start } = context;
  if (date > today) return "none";
  const past = date < today;
  if (total && total.count > 0) {
    if (total.calories > goal * 1.1) return "bad";
    if (past && total.calories < goal * 0.5) return "bad";
    return "good";
  }
  if (past && start && date > start) return "bad";
  return "none";
}

/** Días seguidos con al menos una comida. Si hoy aún no hay nada, la racha cuenta desde ayer. */
export function loggingStreak(byDate: Record<string, DayTotals>, today: string): number {
  let day = byDate[today]?.count ? today : addDays(today, -1);
  let days = 0;
  while (byDate[day]?.count) {
    days += 1;
    day = addDays(day, -1);
  }
  return days;
}

export const ROLLOVER_MAX = 200;

/**
 * Calorías que sobraron el día anterior (como mucho 200) y que se suman al objetivo del día si se ha
 * activado esa opción. Solo cuentan si el día anterior se registró algo.
 */
export function rolloverExtra(byDate: Record<string, DayTotals>, date: string, goal: number): number {
  const previous = byDate[addDays(date, -1)];
  if (!previous || previous.count === 0) return 0;
  return Math.round(Math.min(ROLLOVER_MAX, Math.max(0, goal - previous.calories)));
}

/* ───────────────────────────── Semana ───────────────────────────── */

export type WeeklyTip = "few_logs" | "over" | "under" | "protein" | "good";

export type WeeklyIntake = {
  loggedDays: number;
  avgKcal: number | null;
  prevAvgKcal: number | null;
  daysOnTarget: number;
  avgProteinG: number | null;
  /** Cambio de peso en los últimos 7 días (último de la semana menos el último anterior a ella). */
  weightDeltaKg: number | null;
  tip: WeeklyTip | null;
};

function average(days: string[], byDate: Record<string, DayTotals>, pick: (total: DayTotals) => number | null): number | null {
  const values = days.map((day) => byDate[day]).filter((total): total is DayTotals => Boolean(total?.count)).map(pick);
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0 ? null : Math.round(known.reduce((sum, value) => sum + value, 0) / known.length);
}

/** Resumen de los últimos 7 días (hoy incluido) frente a los 7 anteriores. */
export function weeklyIntake(
  byDate: Record<string, DayTotals>,
  weights: { date: string; kg: number }[],
  goalKcal: number,
  proteinGoalG: number | null,
  today: string,
): WeeklyIntake {
  const week = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
  const previousWeek = Array.from({ length: 7 }, (_, index) => addDays(today, index - 13));
  const start = firstLogDate(byDate);

  const loggedDays = week.filter((day) => byDate[day]?.count).length;
  const avgKcal = average(week, byDate, (total) => total.calories);
  const prevAvgKcal = average(previousWeek, byDate, (total) => total.calories);
  const avgProteinG = average(week, byDate, (total) => total.proteinG);
  const daysOnTarget = week.filter((day) => dayStatus(byDate[day], goalKcal, { date: day, today, start }) === "good").length;

  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const inWeek = sorted.filter((entry) => entry.date >= week[0]! && entry.date <= today);
  let weightDeltaKg: number | null = null;
  if (inWeek.length > 0) {
    const before = sorted.filter((entry) => entry.date < week[0]!);
    const base = before[before.length - 1] ?? inWeek[0]!;
    const last = inWeek[inWeek.length - 1]!;
    if (last.date !== base.date) weightDeltaKg = roundTo(last.kg - base.kg, 2);
  }

  let tip: WeeklyTip | null = null;
  if (loggedDays > 0 && avgKcal !== null) {
    if (loggedDays < 4) tip = "few_logs";
    else if (avgKcal > goalKcal * 1.1) tip = "over";
    else if (avgKcal < goalKcal * 0.8) tip = "under";
    else if (proteinGoalG !== null && avgProteinG !== null && avgProteinG < proteinGoalG * 0.8) tip = "protein";
    else tip = "good";
  }

  return { loggedDays, avgKcal, prevAvgKcal, daysOnTarget, avgProteinG, weightDeltaKg, tip };
}
