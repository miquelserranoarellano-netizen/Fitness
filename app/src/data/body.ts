import { nowIso, type Queryable } from "@/db/types";
import type { WeightEntry } from "@/domain/body/trend";
import { MEASURES, type Measure } from "@/domain/types";
import type { Measurements } from "@/features/profile/schema";
import { newId } from "@/lib/id";

export type WeightRecord = WeightEntry & { id: string; note: string | null };

/** Una pesada por día: si se guarda dos veces el mismo día, se queda la última. */
export async function upsertWeight(db: Queryable, date: string, kg: number, note: string | null = null): Promise<void> {
  await db.run(
    `insert into body_weights (id, measured_on, weight_kg, note, created_at) values (?, ?, ?, ?, ?)
     on conflict (measured_on) do update set weight_kg = excluded.weight_kg, note = excluded.note`,
    [newId(), date, kg, note, nowIso()],
  );
}

/** Pesadas de la más antigua a la más reciente. */
export async function listWeights(db: Queryable): Promise<WeightRecord[]> {
  const rows = await db.all<{ id: string; date: string; kg: number; note: string | null }>(
    "select id, measured_on as date, weight_kg as kg, note from body_weights order by measured_on",
  );
  return rows.map((row) => ({ id: row.id, date: row.date, kg: Number(row.kg), note: row.note }));
}

export async function deleteWeight(db: Queryable, id: string): Promise<void> {
  await db.run("delete from body_weights where id = ?", [id]);
}

export type MeasurementRecord = { id: string; date: string; note: string | null; values: Measurements };

const COLUMN: Record<Measure, string> = {
  neck: "neck_cm",
  shoulders: "shoulders_cm",
  chest: "chest_cm",
  waist: "waist_cm",
  hips: "hips_cm",
  arm_relaxed: "arm_relaxed_cm",
  arm_flexed: "arm_flexed_cm",
  forearm: "forearm_cm",
  wrist: "wrist_cm",
  thigh: "thigh_cm",
  calf: "calf_cm",
};

export function hasAnyMeasurement(values: Measurements): boolean {
  return MEASURES.some((measure) => values[measure] !== null);
}

export async function upsertMeasurements(db: Queryable, date: string, values: Measurements, note: string | null = null): Promise<void> {
  const columns = MEASURES.map((measure) => COLUMN[measure]);
  await db.run(
    `insert into body_measurements (id, measured_on, note, created_at, ${columns.join(", ")})
     values (?, ?, ?, ?, ${columns.map(() => "?").join(", ")})
     on conflict (measured_on) do update set
       note = excluded.note, ${columns.map((column) => `${column} = excluded.${column}`).join(", ")}`,
    [newId(), date, note, nowIso(), ...MEASURES.map((measure) => values[measure])],
  );
}

/** Mediciones de la más antigua a la más reciente. */
export async function listMeasurements(db: Queryable): Promise<MeasurementRecord[]> {
  const rows = await db.all<Record<string, unknown>>(
    `select id, measured_on as date, note, ${Object.values(COLUMN).join(", ")} from body_measurements order by measured_on`,
  );
  return rows.map((row) => ({
    id: row.id as string,
    date: row.date as string,
    note: (row.note as string | null) ?? null,
    values: Object.fromEntries(
      MEASURES.map((measure) => {
        const value = row[COLUMN[measure]];
        return [measure, value === null || value === undefined ? null : Math.round(Number(value) * 10) / 10];
      }),
    ) as Measurements,
  }));
}

export async function deleteMeasurements(db: Queryable, id: string): Promise<void> {
  await db.run("delete from body_measurements where id = ?", [id]);
}
