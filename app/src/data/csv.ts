import type { Queryable } from "@/db/types";
import { exerciseName } from "@/domain/exercises";
import { MEASURES, MEASURE_LABEL } from "@/domain/types";
import { t } from "@/i18n";
import { listFoodEntriesBetween } from "@/integrations/nutrition/store";
import { listSteps, listWater } from "./daily";
import { getCalorieCalendar } from "./nutrition-day";

/**
 * Exportación en CSV para abrir en Excel, Numbers o Google Sheets. Separador «;» y coma decimal (lo que
 * espera Excel en España) y marca UTF-8 al principio para que las tildes salgan bien. La exportación
 * completa, para copias de seguridad, sigue siendo la de JSON (`export.ts`).
 */

export const CSV_KINDS = ["daily", "meals", "workouts", "measurements"] as const;
export type CsvKind = (typeof CSV_KINDS)[number];

type Cell = string | number | null | undefined;

const BOM = "﻿";

function cell(value: Cell): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "number" ? String(Math.round(value * 100) / 100).replace(".", ",") : value;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Texto CSV (con la marca UTF-8) a partir de una cabecera y unas filas. */
export function toCsv(header: string[], rows: Cell[][]): string {
  return BOM + [header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n") + "\r\n";
}

const yesNo = (status: string) => (status === "good" ? t("sí") : status === "bad" ? t("no") : "");

async function firstDate(db: Queryable, today: string): Promise<string> {
  const row = await db.get<{ date: string | null }>(
    `select min(date) as date from (
       select min(logged_on) as date from food_entries
       union all select min(measured_on) from body_weights
       union all select min(logged_on) from water_logs
       union all select min(logged_on) from step_logs)`,
  );
  return row?.date && row.date < today ? row.date : today;
}

/** Un CSV con sus datos y el nombre de archivo propuesto. */
export async function exportCsv(db: Queryable, kind: CsvKind, today: string): Promise<{ fileName: string; content: string }> {
  const fileName = (name: string) => `smart-fitness-coach-${name}-${today}.csv`;

  if (kind === "daily") {
    const from = await firstDate(db, today);
    const [{ days }, entries, water, steps, weights] = await Promise.all([
      getCalorieCalendar(db, from, today, today),
      listFoodEntriesBetween(db, from, today),
      listWater(db, from, today),
      listSteps(db, from, today),
      db.all<{ measured_on: string; weight_kg: number }>("select measured_on, weight_kg from body_weights"),
    ]);
    const sum = (date: string, key: "proteinG" | "carbsG" | "fatG") => {
      const values = entries.filter((entry) => entry.date === date).map((entry) => entry[key]);
      return values.some((value) => value !== null) ? values.reduce<number>((total, value) => total + (value ?? 0), 0) : null;
    };
    const waterBy = new Map(water.map((entry) => [entry.date, entry.ml]));
    const stepsBy = new Map(steps.map((entry) => [entry.date, entry.steps]));
    const weightBy = new Map(weights.map((entry) => [entry.measured_on, entry.weight_kg]));
    return {
      fileName: fileName("diario"),
      content: toCsv(
        [t("Fecha"), t("Calorías"), t("Objetivo (kcal)"), t("Cumplido"), t("Proteína (g)"), t("Carbohidratos (g)"), t("Grasas (g)"), t("Agua (ml)"), t("Pasos"), t("Peso (kg)")],
        days.map((day) => [
          day.date,
          day.count > 0 ? day.calories : null,
          day.goal,
          yesNo(day.status),
          sum(day.date, "proteinG"),
          sum(day.date, "carbsG"),
          sum(day.date, "fatG"),
          waterBy.get(day.date) ?? null,
          stepsBy.get(day.date) ?? null,
          weightBy.get(day.date) ?? null,
        ]),
      ),
    };
  }

  if (kind === "meals") {
    const entries = await listFoodEntriesBetween(db, "0000-01-01", "9999-12-31");
    return {
      fileName: fileName("comidas"),
      content: toCsv(
        [t("Fecha"), t("Hora"), t("Comida"), t("Calorías"), t("Proteína (g)"), t("Carbohidratos (g)"), t("Grasas (g)"), t("Registrada con")],
        entries.map((entry) => [entry.date, entry.eatenAt.slice(11, 16), entry.name, entry.calories, entry.proteinG, entry.carbsG, entry.fatG, entry.source]),
      ),
    };
  }

  if (kind === "workouts") {
    const rows = await db.all<{ started_at: string; name: string; exercise_id: string; set_number: number; weight_kg: number; reps: number; rir: number | null }>(
      `select s.started_at, s.name, e.exercise_id, w.set_number, w.weight_kg, w.reps, w.rir
         from workout_sets w
         join session_exercises e on e.id = w.session_exercise_id
         join workout_sessions s on s.id = e.session_id
        where s.status = 'completed'
        order by s.started_at, e.position, w.set_number`,
    );
    return {
      fileName: fileName("entrenamientos"),
      content: toCsv(
        [t("Fecha"), t("Sesión"), t("Ejercicio"), t("Serie"), t("Peso (kg)"), t("Repeticiones"), t("RIR")],
        rows.map((row) => [row.started_at.slice(0, 10), row.name, exerciseName(row.exercise_id), row.set_number, row.weight_kg, row.reps, row.rir]),
      ),
    };
  }

  const rows = await db.all<Record<string, number | string | null>>("select * from body_measurements order by measured_on");
  return {
    fileName: fileName("medidas"),
    content: toCsv(
      [t("Fecha"), ...MEASURES.map((measure) => `${MEASURE_LABEL[measure]} (cm)`)],
      rows.map((row) => [row.measured_on as string, ...MEASURES.map((measure) => row[`${measure}_cm`] as number | null)]),
    ),
  };
}
