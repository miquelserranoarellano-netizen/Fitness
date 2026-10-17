import { nowIso, type Queryable } from "@/db/types";
import { addDays, isIsoDate, today } from "@/lib/dates";

/**
 * Agua y pasos de cada día (de SnapCal). Un registro por día: guardar otra vez el mismo día sustituye el
 * valor. El agua se guarda siempre en mililitros; los pasos, como número entero con su origen
 * (escritos a mano o leídos del podómetro del iPhone).
 */

export const MAX_WATER_ML = 20000;
export const MAX_STEPS = 200000;

export type StepSource = "manual" | "pedometer";
export type StepsEntry = { date: string; steps: number; source: StepSource };

export type DailyResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Un día de calendario de hasta tres años atrás y nunca futuro. */
function validDay(date: string): boolean {
  const now = today();
  return isIsoDate(date) && date <= now && date >= addDays(now, -1100);
}

/* ───────────────────────────── Agua ───────────────────────────── */

export async function getWater(db: Queryable, date: string): Promise<number> {
  const row = await db.get<{ ml: number }>("select ml from water_logs where logged_on = ?", [date]);
  return row ? Number(row.ml) : 0;
}

export async function setWater(db: Queryable, date: string, ml: number): Promise<DailyResult<number>> {
  if (!validDay(date)) return { ok: false, error: "La fecha no es válida (no puede ser futura)." };
  if (!Number.isFinite(ml)) return { ok: false, error: "Revisa la cantidad de agua." };
  const value = Math.round(Math.min(MAX_WATER_ML, Math.max(0, ml)));
  await db.run("insert into water_logs (logged_on, ml, updated_at) values (?, ?, ?) on conflict (logged_on) do update set ml = excluded.ml, updated_at = excluded.updated_at", [
    date,
    value,
    nowIso(),
  ]);
  return { ok: true, data: value };
}

/** Suma (o resta, con un número negativo) agua al día. Nunca baja de 0. */
export async function addWater(db: Queryable, date: string, deltaMl: number): Promise<DailyResult<number>> {
  return setWater(db, date, (await getWater(db, date)) + deltaMl);
}

export async function listWater(db: Queryable, from: string, to: string): Promise<{ date: string; ml: number }[]> {
  const rows = await db.all<{ logged_on: string; ml: number }>("select logged_on, ml from water_logs where logged_on between ? and ? order by logged_on", [from, to]);
  return rows.map((row) => ({ date: row.logged_on, ml: Number(row.ml) }));
}

/* ───────────────────────────── Pasos ───────────────────────────── */

export async function getSteps(db: Queryable, date: string): Promise<StepsEntry | null> {
  const row = await db.get<{ logged_on: string; steps: number; source: StepSource }>("select logged_on, steps, source from step_logs where logged_on = ?", [date]);
  return row ? { date: row.logged_on, steps: Number(row.steps), source: row.source } : null;
}

export async function setSteps(db: Queryable, date: string, steps: number, source: StepSource): Promise<DailyResult<number>> {
  if (!validDay(date)) return { ok: false, error: "La fecha no es válida (no puede ser futura)." };
  if (!Number.isFinite(steps) || steps < 0 || steps > MAX_STEPS) return { ok: false, error: "Revisa los pasos: parecen fuera de rango." };
  const value = Math.round(steps);
  await db.run(
    `insert into step_logs (logged_on, steps, source, updated_at) values (?, ?, ?, ?)
     on conflict (logged_on) do update set steps = excluded.steps, source = excluded.source, updated_at = excluded.updated_at`,
    [date, value, source, nowIso()],
  );
  return { ok: true, data: value };
}

export async function listSteps(db: Queryable, from: string, to: string): Promise<StepsEntry[]> {
  const rows = await db.all<{ logged_on: string; steps: number; source: StepSource }>(
    "select logged_on, steps, source from step_logs where logged_on between ? and ? order by logged_on",
    [from, to],
  );
  return rows.map((row) => ({ date: row.logged_on, steps: Number(row.steps), source: row.source }));
}
