import { addDays, daysBetween } from "@/lib/dates";
import { getExercise } from "../exercises";
import { isStalled, sessionBestE1rm, type PastPerformance } from "../training/progression";
import { MUSCLES, type Muscle } from "../types";

/** Un registro de ejercicio en una sesión terminada. */
export type Log = PastPerformance & { exerciseId: string };

export type ExerciseTrend = {
  exerciseId: string;
  sessions: number;
  spanDays: number;
  /** Cambio porcentual del rendimiento entre las primeras y las últimas sesiones; null si faltan datos. */
  changePct: number | null;
  stalled: boolean;
  /** Mayor molestia anotada en las tres últimas sesiones (0-3). */
  recentDiscomfort: number;
  lastDate: string;
};

export type MuscleStats = {
  muscle: Muscle;
  /** Sesiones con trabajo directo de este músculo dentro de la ventana. */
  sessions: number;
  spanDays: number;
  /** Series semanales medias de las últimas 4 semanas (las secundarias cuentan media). */
  weeklySets: number;
  /** Media del cambio porcentual de sus ejercicios con datos suficientes. */
  progressPct: number | null;
  exercises: ExerciseTrend[];
  discomfortSessions: number;
};

export const MIN_SESSIONS_FOR_TREND = 3;
export const MIN_SPAN_FOR_TREND = 14;

/** Rendimiento de una sesión: 1RM estimado, o repeticiones si el ejercicio se hace sin carga. */
export function performanceScore(log: Log): number {
  const e1rm = sessionBestE1rm(log.sets);
  if (e1rm > 0) return e1rm;
  return log.sets.reduce((best, set) => Math.max(best, set.reps), 0);
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/** Tendencia de un ejercicio a partir de sus registros (del más reciente al más antiguo). */
export function exerciseTrend(exerciseId: string, logs: Log[]): ExerciseTrend {
  const usable = logs.filter((log) => log.sets.length > 0);
  const newest = usable[0];
  const oldest = usable[usable.length - 1];
  const spanDays = newest && oldest ? daysBetween(oldest.date, newest.date) : 0;
  let changePct: number | null = null;

  if (usable.length >= MIN_SESSIONS_FOR_TREND && spanDays >= MIN_SPAN_FOR_TREND) {
    const scores = usable.map(performanceScore);
    // Con cuatro o más sesiones se comparan medias de dos para amortiguar un día bueno o malo.
    const take = usable.length >= 4 ? 2 : 1;
    const recent = mean(scores.slice(0, take));
    const initial = mean(scores.slice(-take));
    if (initial > 0) changePct = ((recent - initial) / initial) * 100;
  }

  return {
    exerciseId,
    sessions: usable.length,
    spanDays,
    changePct,
    stalled: isStalled(usable),
    recentDiscomfort: usable.slice(0, 3).reduce((max, log) => Math.max(max, log.discomfort), 0),
    lastDate: newest?.date ?? "",
  };
}

/** Series por músculo de un conjunto de registros (principal = 1, secundario = 0,5). */
export function setsByMuscle(logs: Log[]): Record<Muscle, number> {
  const out = Object.fromEntries(MUSCLES.map((muscle) => [muscle, 0])) as Record<Muscle, number>;
  for (const log of logs) {
    const exercise = getExercise(log.exerciseId);
    if (!exercise) continue;
    out[exercise.primary] += log.sets.length;
    for (const muscle of exercise.secondary) out[muscle] += log.sets.length * 0.5;
  }
  return out;
}

/**
 * Estadísticas por grupo muscular a partir de los registros (del más reciente al más antiguo).
 * Solo se usan los registros de los últimos `windowDays` días.
 */
export function muscleStats(allLogs: Log[], today: string, windowDays = 56): Record<Muscle, MuscleStats> {
  const from = addDays(today, -windowDays);
  const logs = allLogs.filter((log) => log.date >= from && log.date <= today && log.sets.length > 0);

  const byExercise = new Map<string, Log[]>();
  for (const log of logs) byExercise.set(log.exerciseId, [...(byExercise.get(log.exerciseId) ?? []), log]);

  const recentFrom = addDays(today, -28);
  const recent = logs.filter((log) => log.date > recentFrom);
  const oldest = logs[logs.length - 1];
  const weeksOfData = oldest ? Math.min(4, Math.max(1, Math.ceil((daysBetween(oldest.date, today) + 1) / 7))) : 1;
  const recentSets = setsByMuscle(recent);

  const out = {} as Record<Muscle, MuscleStats>;
  for (const muscle of MUSCLES) {
    const own = logs.filter((log) => getExercise(log.exerciseId)?.primary === muscle);
    const dates = [...new Set(own.map((log) => log.date))].sort();
    const exercises = [...byExercise.entries()]
      .filter(([exerciseId]) => getExercise(exerciseId)?.primary === muscle)
      .map(([exerciseId, entries]) => exerciseTrend(exerciseId, entries))
      .sort((a, b) => b.sessions - a.sessions);
    const changes = exercises.map((exercise) => exercise.changePct).filter((value): value is number => value !== null);

    out[muscle] = {
      muscle,
      sessions: dates.length,
      spanDays: dates.length > 1 ? daysBetween(dates[0]!, dates[dates.length - 1]!) : 0,
      weeklySets: Math.round((recentSets[muscle] / weeksOfData) * 10) / 10,
      progressPct: changes.length > 0 ? mean(changes) : null,
      exercises,
      discomfortSessions: new Set(own.filter((log) => log.discomfort >= 2).map((log) => log.date)).size,
    };
  }
  return out;
}
