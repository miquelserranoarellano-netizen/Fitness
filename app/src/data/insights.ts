import type { Queryable } from "@/db/types";
import { muscleStats, type MuscleStats } from "@/domain/analysis/muscles";
import { analyzeWeakPoints, sortFindings, type Finding } from "@/domain/analysis/weakpoints";
import { measureProgress, type MeasureProgress } from "@/domain/body/measurements";
import { weightTrend, type WeightTrend } from "@/domain/body/trend";
import { decideCalories, type CalorieDecision } from "@/domain/nutrition/targets";
import { volumeTargets, type VolumeRange } from "@/domain/training/plan";
import type { Measure, Muscle } from "@/domain/types";
import { addDays, daysBetween } from "@/lib/dates";
import { formatLength } from "@/lib/units";
import { listMeasurements, listWeights, type MeasurementRecord, type WeightRecord } from "./body";
import { getCurrentTarget, type NutritionTarget } from "./nutrition";
import { getTrainingOverview, type TrainingOverview } from "./overview";
import { requireProfile, type Profile } from "./profile";
import { listCheckins, type Checkin } from "./reviews";
import { getExerciseLogs, type ExerciseLog } from "./sessions";

/**
 * Todo lo que el «entrenador» sabe del usuario en un momento dado: datos guardados y lo que se
 * deriva de ellos con reglas deterministas. Es la base del inicio, el análisis y las revisiones.
 */
export type Insights = {
  today: string;
  profile: Profile;
  training: TrainingOverview;
  weights: WeightRecord[];
  measurements: MeasurementRecord[];
  logs: ExerciseLog[];
  checkins: Checkin[];
  nutritionTarget: NutritionTarget | null;
  trend: WeightTrend;
  measures: Record<Measure, MeasureProgress>;
  stats: Record<Muscle, MuscleStats>;
  targets: Record<Muscle, VolumeRange>;
  /** Sesiones completadas / previstas en las últimas 4 semanas cerradas (0-1); null si aún no hay ninguna. */
  adherence: number | null;
  poorRecovery: boolean;
  findings: Finding[];
  calorieDecision: CalorieDecision;
};

export async function getInsights(db: Queryable): Promise<Insights> {
  const profile = await requireProfile(db);
  const training = await getTrainingOverview(db, profile.daysPerWeek);
  const weights = await listWeights(db);
  const measurements = await listMeasurements(db);
  const logs = await getExerciseLogs(db, { sinceDays: 365 });
  const checkins = await listCheckins(db);
  const nutritionTarget = await getCurrentTarget(db);
  const { today } = training;

  const trend = weightTrend(weights, today);
  const measures = measureProgress(measurements);
  const stats = muscleStats(logs, today);
  const targets = training.block?.rationale.volumeTargets ?? volumeTargets(profile.level, profile.priorityMuscles);

  // Adherencia: semanas ya terminadas (la semana en curso no cuenta en contra).
  const closed = training.weeks.filter((week) => week.weekStart !== training.thisWeek.weekStart).slice(-4);
  const adherence =
    closed.length === 0 ? null : Math.min(1, closed.reduce((sum, week) => sum + week.completed, 0) / closed.reduce((sum, week) => sum + week.planned, 0));

  const lastCheckin = checkins[0];
  const poorRecovery = Boolean(
    lastCheckin && lastCheckin.weekStart >= addDays(today, -10) && (lastCheckin.answers.sleepQuality <= 2 || lastCheckin.answers.energy <= 2),
  );

  const findings = sortFindings(
    analyzeWeakPoints({
      stats,
      targets,
      measures,
      declaredWeak: profile.weakMuscles,
      priority: profile.priorityMuscles,
      adherence,
      poorRecovery,
      formatLength: (cm) => formatLength(cm, profile.units),
    }),
  );

  const recentAdherence = checkins.slice(0, 2).map((checkin) => checkin.answers.nutritionAdherence);
  const waist = measures.waist;
  const first = weights[0];
  const last = weights[weights.length - 1];
  const calorieDecision = decideCalories({
    trend,
    goal: profile.primaryGoal,
    level: profile.level,
    daysSinceLastChange: nutritionTarget ? daysBetween(nutritionTarget.effectiveFrom, today) : 999,
    nutritionAdherence: recentAdherence.length > 0 ? recentAdherence.reduce((a, b) => a + b, 0) / recentAdherence.length : null,
    waistVsWeight:
      waist.vsFirst && first && last && first.kg > 0 && first.date !== last.date
        ? { waistPct: waist.vsFirst.percent, weightPct: ((last.kg - first.kg) / first.kg) * 100 }
        : null,
    currentCalories: nutritionTarget?.calories ?? null,
    sex: profile.sex,
  });

  return {
    today,
    profile,
    training,
    weights,
    measurements,
    logs,
    checkins,
    nutritionTarget,
    trend,
    measures,
    stats,
    targets,
    adherence,
    poorRecovery,
    findings,
    calorieDecision,
  };
}
