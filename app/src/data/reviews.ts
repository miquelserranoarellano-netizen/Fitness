import { bool, json, nowIso, parseJson, type Queryable } from "@/db/types";
import type { MonthlyReport } from "@/domain/review/monthly";
import type { CheckinAnswers, ReviewChange, WeeklyReport } from "@/domain/review/weekly";
import { newId } from "@/lib/id";

export type Checkin = { id: string; weekStart: string; answers: CheckinAnswers; report: WeeklyReport; createdAt: string };

type CheckinRow = {
  id: string;
  week_start: string;
  workouts_completed: number;
  nutrition_adherence: number;
  sleep_quality: number;
  energy: number;
  appetite: number;
  performance: number;
  pain: number;
  pain_notes: string | null;
  improved_exercises: string | null;
  difficulties: string | null;
  weight_kg: number | null;
  report: string;
  created_at: string;
};

const mapCheckin = (row: CheckinRow): Checkin => ({
  id: row.id,
  weekStart: row.week_start,
  answers: {
    workoutsCompleted: row.workouts_completed,
    nutritionAdherence: row.nutrition_adherence,
    sleepQuality: row.sleep_quality,
    energy: row.energy,
    appetite: row.appetite,
    performance: row.performance,
    pain: Boolean(row.pain),
    painNotes: row.pain_notes ?? "",
    improvedExercises: row.improved_exercises ?? "",
    difficulties: row.difficulties ?? "",
    weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
  },
  report: parseJson<WeeklyReport>(row.report, {} as WeeklyReport),
  createdAt: row.created_at,
});

/** Revisiones semanales, de la más reciente a la más antigua. */
export async function listCheckins(db: Queryable): Promise<Checkin[]> {
  const rows = await db.all<CheckinRow>("select * from weekly_checkins order by week_start desc");
  return rows.map(mapCheckin);
}

export async function getCheckin(db: Queryable, weekStart: string): Promise<Checkin | null> {
  const row = await db.get<CheckinRow>("select * from weekly_checkins where week_start = ?", [weekStart]);
  return row ? mapCheckin(row) : null;
}

export async function upsertCheckin(db: Queryable, weekStart: string, answers: CheckinAnswers, report: WeeklyReport): Promise<void> {
  await db.run(
    `insert into weekly_checkins
       (id, week_start, workouts_completed, nutrition_adherence, sleep_quality, energy, appetite, performance,
        pain, pain_notes, improved_exercises, difficulties, weight_kg, report, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict (week_start) do update set
       workouts_completed = excluded.workouts_completed, nutrition_adherence = excluded.nutrition_adherence,
       sleep_quality = excluded.sleep_quality, energy = excluded.energy, appetite = excluded.appetite,
       performance = excluded.performance, pain = excluded.pain, pain_notes = excluded.pain_notes,
       improved_exercises = excluded.improved_exercises, difficulties = excluded.difficulties,
       weight_kg = excluded.weight_kg, report = excluded.report`,
    [
      newId(),
      weekStart,
      answers.workoutsCompleted,
      answers.nutritionAdherence,
      answers.sleepQuality,
      answers.energy,
      answers.appetite,
      answers.performance,
      bool(answers.pain),
      answers.painNotes || null,
      answers.improvedExercises || null,
      answers.difficulties || null,
      answers.weightKg,
      json(report),
      nowIso(),
    ],
  );
}

export type StoredMonthlyReport = { id: string; periodStart: string; periodEnd: string; report: MonthlyReport; createdAt: string };

type MonthlyRow = { id: string; period_start: string; period_end: string; report: string; created_at: string };

const mapMonthly = (row: MonthlyRow): StoredMonthlyReport => ({
  id: row.id,
  periodStart: row.period_start,
  periodEnd: row.period_end,
  report: parseJson<MonthlyReport>(row.report, {} as MonthlyReport),
  createdAt: row.created_at,
});

export async function listMonthlyReports(db: Queryable): Promise<StoredMonthlyReport[]> {
  const rows = await db.all<MonthlyRow>("select * from monthly_reports order by period_start desc");
  return rows.map(mapMonthly);
}

export async function getMonthlyReport(db: Queryable, id: string): Promise<StoredMonthlyReport | null> {
  const row = await db.get<MonthlyRow>("select * from monthly_reports where id = ?", [id]);
  return row ? mapMonthly(row) : null;
}

export async function insertMonthlyReport(db: Queryable, report: MonthlyReport): Promise<string> {
  const existing = await db.get<{ id: string }>("select id from monthly_reports where period_start = ?", [report.periodStart]);
  if (existing) {
    await db.run("update monthly_reports set period_end = ?, report = ? where id = ?", [report.periodEnd, json(report), existing.id]);
    return existing.id;
  }
  const id = newId();
  await db.run("insert into monthly_reports (id, period_start, period_end, report, created_at) values (?, ?, ?, ?, ?)", [
    id,
    report.periodStart,
    report.periodEnd,
    json(report),
    nowIso(),
  ]);
  return id;
}

/* ───────────────────────── Recomendaciones: la memoria de decisiones ───────────────────────── */

export type RecommendationStatus = "proposed" | "accepted" | "dismissed" | "applied";

export type Recommendation = {
  id: string;
  source: "rules" | "ai";
  area: ReviewChange["area"];
  title: string;
  detail: string;
  evidence: string[];
  status: RecommendationStatus;
  outcome: string | null;
  createdOn: string;
  /** Ajuste de calorías asociado, si lo hay. */
  calorieDelta: number | null;
};

export async function insertRecommendations(db: Queryable, changes: ReviewChange[]): Promise<void> {
  for (const change of changes) {
    await db.run("insert into recommendations (id, source, area, title, detail, evidence, created_at) values (?, 'rules', ?, ?, ?, ?, ?)", [
      newId(),
      change.area,
      change.title,
      change.detail,
      json({ items: change.evidence, calorieDelta: change.calorieDelta }),
      nowIso(),
    ]);
  }
}

export async function listRecommendations(db: Queryable, limit = 30): Promise<Recommendation[]> {
  const rows = await db.all<{
    id: string;
    source: "rules" | "ai";
    area: ReviewChange["area"];
    title: string;
    detail: string;
    evidence: string;
    status: RecommendationStatus;
    outcome: string | null;
    created_at: string;
  }>("select * from recommendations order by created_at desc limit ?", [limit]);
  return rows.map((row) => {
    const evidence = parseJson<{ items?: string[]; calorieDelta?: number }>(row.evidence, {});
    return {
      id: row.id,
      source: row.source,
      area: row.area,
      title: row.title,
      detail: row.detail,
      evidence: evidence.items ?? [],
      status: row.status,
      outcome: row.outcome,
      createdOn: row.created_at.slice(0, 10),
      calorieDelta: typeof evidence.calorieDelta === "number" ? evidence.calorieDelta : null,
    };
  });
}

/** Cambia el estado de una recomendación que siga pendiente. */
export async function decideRecommendation(db: Queryable, id: string, status: Exclude<RecommendationStatus, "proposed">, outcome: string | null = null): Promise<boolean> {
  const result = await db.run("update recommendations set status = ?, outcome = ?, decided_at = ? where id = ? and status = 'proposed'", [
    status,
    outcome,
    nowIso(),
    id,
  ]);
  return result.changes > 0;
}

/** Al repetir una revisión se retiran las propuestas pendientes anteriores. */
export async function clearProposedRecommendations(db: Queryable): Promise<void> {
  await db.run("delete from recommendations where status = 'proposed' and source = 'rules'");
}

/** Marca como aplicadas las propuestas de calorías pendientes (al aplicar un ajuste). */
export async function markCalorieRecommendationsApplied(db: Queryable, outcome: string): Promise<void> {
  const pending = await db.all<{ id: string; evidence: string }>("select id, evidence from recommendations where status = 'proposed' and area = 'nutrition'");
  for (const row of pending) {
    if (typeof parseJson<{ calorieDelta?: number }>(row.evidence, {}).calorieDelta === "number") {
      await decideRecommendation(db, row.id, "applied", outcome);
    }
  }
}
