import type { Queryable } from "@/db/types";
import { dayStatus, firstLogDate, goalOn, periodSummary, totalsByDate, type DayStatus } from "@/domain/nutrition/intake";
import { getDayIntake, listFoodEntriesBetween } from "@/integrations/nutrition/store";
import { addDays } from "@/lib/dates";
import { getSteps, getWater } from "./daily";
import { listNutritionTargets } from "./nutrition";
import { getSettings } from "./settings";

/**
 * Datos de la pantalla de Nutrición: lo comido hoy, el agua, los pasos y si ya se ha probado la cámara.
 * El calendario de calorías va aparte (`getCalorieCalendar`), por periodo.
 */

export async function getNutritionDay(db: Queryable, date: string) {
  const [intake, waterMl, steps, settings, photoMeals] = await Promise.all([
    getDayIntake(db, date),
    getWater(db, date),
    getSteps(db, date),
    getSettings(db),
    db.get<{ n: number }>("select count(*) as n from food_entries where source = 'foto'"),
  ]);
  return { intake, waterMl, steps, settings, hasPhotoMeal: (photoMeals?.n ?? 0) > 0 };
}

export type CalendarDay = { date: string; calories: number; count: number; goal: number | null; status: DayStatus };

/**
 * Cada día de `from` a `to` con lo comido, el objetivo vigente ese día y si se cumplió (entre el 90 % y el
 * 105 %). Los días anteriores al primer registro no cuentan como fallados.
 */
export async function getCalorieCalendar(db: Queryable, from: string, to: string, today: string) {
  const [entries, targets, first] = await Promise.all([
    listFoodEntriesBetween(db, from, to),
    listNutritionTargets(db),
    db.get<{ date: string | null }>("select min(logged_on) as date from food_entries"),
  ]);
  const byDate = totalsByDate(entries);
  const start = first?.date ?? firstLogDate(byDate);
  const days: CalendarDay[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const total = byDate[date];
    const goal = goalOn(targets, date);
    days.push({
      date,
      calories: total?.calories ?? 0,
      count: total?.count ?? 0,
      goal,
      status: goal === null ? "none" : dayStatus(total, goal, { date, today, start }),
    });
  }
  return { days, summary: periodSummary(days), start };
}

/** Primer día con comidas registradas, para el periodo «Todo». */
export async function firstMealDate(db: Queryable): Promise<string | null> {
  const row = await db.get<{ date: string | null }>("select min(logged_on) as date from food_entries");
  return row?.date ?? null;
}
