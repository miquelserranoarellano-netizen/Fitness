import type { Db } from "@/db/types";
import { USER_TABLES } from "@/db/migrations";
import { checkManualTarget, gramsFromSplit, type MacroSplit } from "@/domain/nutrition/macros";
import { calorieFloor } from "@/domain/nutrition/targets";
import { buildMonthlyReport } from "@/domain/review/monthly";
import { buildWeeklyReport, type CheckinAnswers } from "@/domain/review/weekly";
import { determineLevel } from "@/domain/training/level";
import { decideNextBlock } from "@/domain/training/next-block";
import { MACRO_STYLES, MEASURES, MEASURE_LABEL, MUSCLE_LABEL, type MacroStyle } from "@/domain/types";
import {
  firstIssue,
  limitationSchema,
  MEASURE_RANGE,
  onboardingSchema,
  profileSchema,
  type Measurements,
  type OnboardingInput,
} from "@/features/profile/schema";
import { addDays, daysBetween, formatDate, isIsoDate, today as todayDate, weekStart as weekStartOf } from "@/lib/dates";
import { formatLength, formatWeight } from "@/lib/units";
import { createBlockFromProfile, getActiveBlock, saveBlockEvaluation, UnusablePlanError, type BlockEvaluation } from "./blocks";
import { hasAnyMeasurement, listWeights, upsertMeasurements, upsertWeight } from "./body";
import { getInsights } from "./insights";
import { createTargetFromProfile, getCurrentTarget, insertNutritionTarget } from "./nutrition";
import {
  getLimitations,
  insertLimitation,
  markOnboarded,
  requireProfile,
  setNutritionPreferences,
  upsertProfile,
  type Profile,
} from "./profile";
import {
  clearProposedRecommendations,
  insertMonthlyReport,
  insertRecommendations,
  listMonthlyReports,
  markCalorieRecommendationsApplied,
  upsertCheckin,
} from "./reviews";
import { getOpenSession } from "./sessions";

/**
 * Operaciones que combinan varias tablas (lo que en la web eran las «acciones de servidor»).
 * Validan su entrada igual que la web: la interfaz no es una frontera de confianza menor por estar
 * en el mismo teléfono, y así un error de la pantalla no deja datos a medias.
 */

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = (error: string): Result<never> => ({ ok: false, error });

/**
 * Para las transacciones que crean una rutina: si no se ha guardado porque tenía días sin ejercicios
 * (`UnusablePlanError`), devuelve el motivo como resultado; cualquier otro error sigue su camino.
 */
function planFailure(error: unknown): Result<never> {
  if (error instanceof UnusablePlanError) return fail(error.message);
  throw error;
}

/* ───────────────────────────── Cuestionario inicial ───────────────────────────── */

/**
 * Guarda el perfil, el primer peso y las medidas, y genera el primer bloque de entrenamiento y el
 * objetivo nutricional. Todo o nada.
 */
export async function completeOnboarding(db: Db, data: unknown): Promise<Result> {
  const parsed = onboardingSchema.safeParse(data);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const input: OnboardingInput = parsed.data;
  if (input.trainingWeekdays.length > 0 && new Set(input.trainingWeekdays).size !== input.daysPerWeek) {
    return fail(`Marca exactamente ${input.daysPerWeek} días de entrenamiento o no marques ninguno.`);
  }

  const { level, reasons } = determineLevel({
    experience: input.experience,
    structuredProgram: input.structuredProgram,
    tracksLoads: input.tracksLoads,
    marks: input.strengthMarks,
    bodyWeightKg: input.weightKg,
    sex: input.sex,
  });
  const date = todayDate();

  try {
    await db.transaction(async (tx) => {
      const done = await tx.get<{ n: number }>("select count(*) as n from profiles where onboarding_completed_at is not null");
      if ((done?.n ?? 0) > 0) throw new Error("El cuestionario inicial ya estaba completado.");

      await upsertProfile(tx, input, level);
      await tx.run("delete from limitations");
      for (const limitation of input.limitations) await insertLimitation(tx, limitation);
      await upsertWeight(tx, date, input.weightKg);
      if (hasAnyMeasurement(input.measurements)) await upsertMeasurements(tx, date, input.measurements);

      const profile = await requireProfile(tx);
      const limitations = await getLimitations(tx);
      await createBlockFromProfile(tx, profile, limitations, { levelReasons: reasons, startedOn: date });
      await createTargetFromProfile(tx, profile, input.weightKg, "initial", date);
      await markOnboarded(tx);
    });
  } catch (error) {
    return planFailure(error);
  }
  return ok(undefined);
}

/* ───────────────────────────── Perfil ───────────────────────────── */

export type ProfileSaveResult = { planAffected: boolean; nutritionAffected: boolean };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Campos del perfil que, si cambian, hacen que la rutina actual deje de corresponderse con él. */
function planKey(profile: Profile) {
  return [
    profile.level,
    profile.daysPerWeek,
    profile.sessionMinutes,
    [...profile.equipment].sort(),
    [...profile.priorityMuscles].sort(),
    [...profile.dislikedExercises].sort(),
    [...profile.favoriteExercises].sort(),
    profile.primaryGoal === "strength" || profile.secondaryGoals.includes("strength"),
  ];
}

function nutritionKey(profile: Profile) {
  return [
    profile.sex,
    profile.ageYears,
    profile.heightCm,
    profile.jobActivity,
    profile.dailySteps,
    profile.daysPerWeek,
    profile.sessionMinutes,
    profile.primaryGoal,
    profile.level,
    profile.macroStyle,
  ];
}

export async function updateProfile(db: Db, data: unknown): Promise<Result<ProfileSaveResult>> {
  const parsed = profileSchema.safeParse(data);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const input = parsed.data;
  if (input.trainingWeekdays.length > 0 && new Set(input.trainingWeekdays).size !== input.daysPerWeek) {
    return fail(`Marca exactamente ${input.daysPerWeek} días de entrenamiento o no marques ninguno.`);
  }

  const before = await requireProfile(db);
  const weights = await listWeights(db);
  const { level } = determineLevel({
    experience: input.experience,
    structuredProgram: input.structuredProgram,
    tracksLoads: input.tracksLoads,
    marks: input.strengthMarks,
    bodyWeightKg: weights[weights.length - 1]?.kg ?? 0,
    sex: input.sex,
  });
  await upsertProfile(db, input, level);
  const after = await requireProfile(db);
  return ok({ planAffected: !same(planKey(before), planKey(after)), nutritionAffected: !same(nutritionKey(before), nutritionKey(after)) });
}

/**
 * Genera una rutina nueva con el perfil actual. Conserva los ajustes de volumen y los ejercicios
 * retirados que se decidieron al evaluar bloques anteriores.
 */
export async function regeneratePlan(db: Db): Promise<Result> {
  if (await getOpenSession(db)) return fail("Tienes una sesión en curso. Termínala o descártala antes de cambiar de rutina.");
  const profile = await requireProfile(db);
  const limitations = await getLimitations(db);
  const block = await getActiveBlock(db);
  const weights = await listWeights(db);
  const level = determineLevel({
    experience: profile.experience,
    structuredProgram: profile.structuredProgram,
    tracksLoads: profile.tracksLoads,
    marks: profile.strengthMarks,
    bodyWeightKg: weights[weights.length - 1]?.kg ?? 0,
    sex: profile.sex,
  });

  try {
    await db.transaction(async (tx) => {
      await createBlockFromProfile(tx, profile, limitations, {
        levelReasons: level.reasons,
        startedOn: todayDate(),
        carry: {
          volumeAdjust: block?.rationale.volumeAdjust,
          avoidExercises: block?.rationale.avoidExercises,
          changes: block
            ? [
                {
                  title: "Rutina regenerada tras cambiar el perfil",
                  detail:
                    "Has modificado datos que afectan al plan (días, tiempo, material, prioridades, limitaciones o preferencias) y has pedido una rutina nueva. Tu historial de cargas se conserva: los ejercicios que repitan seguirán partiendo de lo último que registraste.",
                },
              ]
            : undefined,
        },
      });
    });
  } catch (error) {
    return planFailure(error);
  }
  return ok(undefined);
}

export async function addLimitation(db: Db, data: unknown): Promise<Result> {
  const parsed = limitationSchema.safeParse(data);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const current = await getLimitations(db);
  if (current.filter((item) => item.active).length >= 10) return fail("Tienes demasiadas limitaciones activas: marca como resueltas las que ya no apliquen.");
  await insertLimitation(db, parsed.data);
  return ok(undefined);
}

/* ───────────────────────────── Cuerpo ───────────────────────────── */

/** La fecha debe ser de calendario, no futura y de los últimos tres años. */
function validDate(date: string): boolean {
  const now = todayDate();
  return isIsoDate(date) && date <= now && date >= addDays(now, -1100);
}

export async function logWeight(db: Db, input: { date: string; kg: number; note?: string | null }): Promise<Result> {
  if (!validDate(input.date)) return fail("La fecha no es válida (no puede ser futura).");
  if (!Number.isFinite(input.kg) || input.kg < 30 || input.kg > 300) return fail("Revisa el peso: parece fuera de rango.");
  await upsertWeight(db, input.date, Math.round(input.kg * 100) / 100, input.note?.trim() || null);
  return ok(undefined);
}

export async function saveMeasurements(db: Db, date: string, values: Measurements): Promise<Result> {
  if (!validDate(date)) return fail("La fecha no es válida (no puede ser futura).");
  for (const measure of MEASURES) {
    const value = values[measure];
    if (value === null) continue;
    const [min, max] = MEASURE_RANGE[measure];
    if (!Number.isFinite(value) || value < min || value > max) return fail(`«${MEASURE_LABEL[measure]}» parece fuera de rango. Compruébalo o déjalo en blanco.`);
  }
  if (!hasAnyMeasurement(values)) return fail("Escribe al menos una medida.");
  await upsertMeasurements(db, date, values);
  return ok(undefined);
}

/* ───────────────────────────── Nutrición ───────────────────────────── */

/**
 * Aplica el ajuste de calorías que proponen las reglas. El cambio se vuelve a calcular aquí con los
 * datos actuales: la pantalla no decide la cifra.
 */
export async function applyCalorieDecision(db: Db): Promise<Result<{ calories: number }>> {
  const insights = await getInsights(db);
  const { calorieDecision: decision, nutritionTarget: current } = insights;
  if (!current) return fail("Todavía no tienes un objetivo nutricional.");
  if (decision.action !== "increase" && decision.action !== "decrease") return fail("Ahora mismo no hay ningún ajuste justificado por tus datos.");

  const calories = Math.max(calorieFloor(insights.profile.sex), current.calories + decision.deltaKcal);
  const carbsG = Math.max(0, Math.round((calories - current.proteinG * 4 - current.fatG * 9) / 4 / 5) * 5);
  const date = todayDate();
  await db.transaction(async (tx) => {
    await insertNutritionTarget(
      tx,
      {
        calories,
        proteinG: current.proteinG,
        carbsG,
        fatG: current.fatG,
        reason: "adjustment",
        method: { ...current.method, decision: { title: decision.title, reason: decision.reason, deltaKcal: decision.deltaKcal } },
      },
      date,
    );
    await markCalorieRecommendationsApplied(tx, `Objetivo actualizado a ${calories} kcal el ${formatDate(date)}.`);
  });
  return ok({ calories });
}

/**
 * Reparto de macros y peso deseado. El peso deseado debe ir en la dirección del objetivo (por debajo
 * del actual para perder grasa, por encima para ganar músculo). No recalcula el objetivo: lo indica,
 * igual que al editar el perfil.
 */
export async function updateNutritionPreferences(
  db: Db,
  input: { macroStyle: MacroStyle; targetWeightKg: number | null },
): Promise<Result<{ nutritionAffected: boolean }>> {
  if (!MACRO_STYLES.includes(input.macroStyle)) return fail("Elige un reparto de macros válido.");
  const target = input.targetWeightKg;
  if (target !== null && (!Number.isFinite(target) || target < 30 || target > 300)) return fail("Revisa el peso deseado: parece fuera de rango.");
  const profile = await requireProfile(db);
  const weights = await listWeights(db);
  const current = weights[weights.length - 1]?.kg ?? null;
  if (target !== null && current !== null) {
    if (profile.primaryGoal === "fat_loss" && target >= current) return fail("Para perder grasa, el peso deseado tiene que ser menor que el actual.");
    if (profile.primaryGoal === "muscle_gain" && target <= current) return fail("Para ganar músculo, el peso deseado tiene que ser mayor que el actual.");
  }
  await setNutritionPreferences(db, { macroStyle: input.macroStyle, targetWeightKg: target === null ? null : Math.round(target * 10) / 10 });
  return ok({ nutritionAffected: input.macroStyle !== profile.macroStyle });
}

/** Recalcula el objetivo desde cero con el perfil y el peso actuales. */
export async function recalculateTarget(db: Db): Promise<Result<{ calories: number }>> {
  const profile = await requireProfile(db);
  const weights = await listWeights(db);
  const last = weights[weights.length - 1];
  if (!last) return fail("Registra tu peso antes de recalcular.");
  const estimate = await createTargetFromProfile(db, profile, last.kg, "profile_change", todayDate());
  return ok({ calories: estimate.calories });
}

/**
 * Objetivo de calorías y macros puesto a mano (desde Nutrición). Los gramos salen del reparto, así que
 * cuadran con las calorías. Queda vigente desde hoy hasta que se recalcule o se ajuste por tendencia.
 */
export async function setManualTarget(db: Db, input: { calories: number; split: MacroSplit }): Promise<Result<{ calories: number }>> {
  const profile = await requireProfile(db);
  const problem = checkManualTarget(input.calories, input.split, calorieFloor(profile.sex));
  if (problem) return fail(problem);
  const current = await getCurrentTarget(db);
  if (!current) return fail("Todavía no hay un objetivo del que partir.");
  await insertNutritionTarget(
    db,
    { calories: input.calories, ...gramsFromSplit(input.calories, input.split), reason: "manual", method: { ...current.method, manual: input.split } },
    todayDate(),
  );
  return ok({ calories: input.calories });
}

/**
 * Cambiar datos desde el informe inicial: guarda el perfil y, con él, vuelve a calcular la rutina y el
 * objetivo de calorías y macros. Si hay una sesión de entrenamiento abierta, la rutina no se toca (se avisa)
 * pero el perfil y las calorías sí se actualizan.
 */
export async function updateProfileAndReplan(db: Db, data: unknown): Promise<Result<{ planRegenerated: boolean; calories: number | null }>> {
  const saved = await updateProfile(db, data);
  if (!saved.ok) return saved;
  const plan = await regeneratePlan(db);
  const target = await recalculateTarget(db);
  return ok({ planRegenerated: plan.ok, calories: target.ok ? target.data.calories : null });
}

/* ───────────────────────────── Revisiones ───────────────────────────── */

export type CheckinForm = Omit<CheckinAnswers, "weightKg"> & { weekStart: string; weightKg: number | null };

export async function submitCheckin(db: Db, form: CheckinForm): Promise<Result<{ weekStart: string }>> {
  const today = todayDate();
  const ratings = [form.nutritionAdherence, form.sleepQuality, form.energy, form.appetite, form.performance];
  if (ratings.some((value) => !Number.isInteger(value) || value < 1 || value > 5)) {
    return fail("Responde a todas las preguntas de valoración (incluida la de dolor o molestias) antes de enviar.");
  }
  if (!Number.isInteger(form.workoutsCompleted) || form.workoutsCompleted < 0 || form.workoutsCompleted > 14) return fail("Revisa el número de entrenamientos.");
  // Solo se puede revisar la semana en curso o la anterior.
  const week = form.weekStart;
  if (week !== weekStartOf(today) && week !== addDays(weekStartOf(today), -7)) return fail("Esa semana ya no se puede revisar.");
  if (form.weightKg !== null && (form.weightKg < 30 || form.weightKg > 300)) return fail("Revisa el peso: parece fuera de rango.");

  if (form.weightKg !== null) await upsertWeight(db, today, Math.round(form.weightKg * 100) / 100);

  // Con el peso ya guardado se recalcula todo y se construye el informe.
  const insights = await getInsights(db);
  const { units } = insights.profile;
  const weekEnd = addDays(week, 6);
  const answers: CheckinAnswers = {
    workoutsCompleted: form.workoutsCompleted,
    nutritionAdherence: form.nutritionAdherence,
    sleepQuality: form.sleepQuality,
    energy: form.energy,
    appetite: form.appetite,
    performance: form.performance,
    pain: form.pain,
    painNotes: form.painNotes.trim(),
    improvedExercises: form.improvedExercises.trim(),
    difficulties: form.difficulties.trim(),
    weightKg: form.weightKg,
  };
  const report = buildWeeklyReport({
    weekStart: week,
    answers,
    plannedSessions: insights.profile.daysPerWeek,
    loggedSessions: insights.training.sessions.filter((session) => session.date >= week && session.date <= weekEnd).length,
    weekLogs: insights.logs.filter((log) => log.date >= week && log.date <= weekEnd),
    priorLogs: insights.logs.filter((log) => log.date < week),
    volumeTargets: insights.targets,
    priorityMuscles: insights.profile.priorityMuscles,
    weights: insights.weights,
    trend: insights.trend,
    calorieDecision: insights.calorieDecision,
    proteinTargetG: insights.nutritionTarget?.proteinG ?? null,
    previous: insights.checkins
      .filter((checkin) => checkin.weekStart < week)
      .map((checkin) => ({
        weekStart: checkin.weekStart,
        energy: checkin.answers.energy,
        sleepQuality: checkin.answers.sleepQuality,
        performance: checkin.answers.performance,
        pain: checkin.answers.pain,
      })),
    formatWeight: (kg) => formatWeight(kg, units, 1),
  });

  await db.transaction(async (tx) => {
    await upsertCheckin(tx, week, answers, report);
    await clearProposedRecommendations(tx);
    await insertRecommendations(tx, report.changes);
  });
  return ok({ weekStart: week });
}

const MIN_MONTHLY_DAYS = 21;

export async function generateMonthlyReport(db: Db): Promise<Result<{ id: string }>> {
  const insights = await getInsights(db);
  const { today, profile } = insights;
  const previous = (await listMonthlyReports(db))[0];
  const firstData = [insights.weights[0]?.date, insights.measurements[0]?.date, insights.training.sessions[insights.training.sessions.length - 1]?.date].filter(
    (date): date is string => Boolean(date),
  );
  const periodStart = previous ? addDays(previous.periodEnd, 1) : (firstData.sort()[0] ?? today);
  const elapsed = daysBetween(periodStart, today);
  if (elapsed < MIN_MONTHLY_DAYS) {
    return fail(
      `Aún es pronto: el periodo empezó el ${formatDate(periodStart)} y hacen falta al menos ${MIN_MONTHLY_DAYS} días de datos. Podrás generarlo a partir del ${formatDate(addDays(periodStart, MIN_MONTHLY_DAYS))}.`,
    );
  }

  const sessionsCompleted = insights.training.sessions.filter((session) => session.date >= periodStart && session.date <= today).length;
  const report = buildMonthlyReport({
    periodStart,
    periodEnd: today,
    weights: insights.weights,
    measures: insights.measures,
    sessionsCompleted,
    sessionsPlanned: Math.max(1, Math.round((elapsed / 7) * profile.daysPerWeek)),
    findings: insights.findings,
    calorieDecision: insights.calorieDecision,
    formatLength: (cm) => formatLength(cm, profile.units),
    formatWeight: (kg) => formatWeight(kg, profile.units),
  });
  return ok({ id: await insertMonthlyReport(db, report) });
}

/**
 * Cierra el bloque actual con su evaluación y genera el siguiente a partir de lo registrado:
 * se mantiene lo que funciona y solo cambia lo que los datos justifican.
 */
export async function startNextBlock(db: Db): Promise<Result> {
  const insights = await getInsights(db);
  const { profile, training, today } = insights;
  const block = training.block;
  if (!block) return fail("No hay ningún bloque activo.");
  if (training.openSession) return fail("Tienes una sesión en curso. Termínala o descártala antes de cambiar de bloque.");
  if (daysBetween(block.startedOn, today) < 14) return fail("El bloque lleva menos de dos semanas: todavía no hay datos suficientes para evaluarlo.");

  const weeksElapsed = Math.min(block.weeksPlanned, Math.max(1, Math.round(daysBetween(block.startedOn, today) / 7)));
  const sessionsCompleted = training.sessions.filter((session) => session.blockId === block.id).length;
  const sessionsPlanned = weeksElapsed * block.rationale.daysPerWeek;
  const adherence = Math.min(1, sessionsCompleted / Math.max(1, sessionsPlanned));
  const blockCheckins = insights.checkins.filter((checkin) => checkin.weekStart >= weekStartOf(block.startedOn));

  const decision = decideNextBlock({
    findings: insights.findings,
    stats: insights.stats,
    priority: profile.priorityMuscles,
    previousAdjust: block.rationale.volumeAdjust ?? {},
    adherence,
    checkins: blockCheckins.map((checkin) => ({
      energy: checkin.answers.energy,
      sleepQuality: checkin.answers.sleepQuality,
      performance: checkin.answers.performance,
      pain: checkin.answers.pain,
    })),
  });

  const strong = insights.findings.filter((finding) => finding.kind === "strength").map((finding) => MUSCLE_LABEL[finding.muscle].toLowerCase());
  const stalled = insights.findings.filter((finding) => finding.kind === "confirmed").map((finding) => MUSCLE_LABEL[finding.muscle].toLowerCase());
  const unknown = insights.findings.filter((finding) => finding.kind === "insufficient").length;
  const evaluation: BlockEvaluation = {
    sessionsCompleted,
    sessionsPlanned,
    adherencePct: Math.round(adherence * 100),
    closedOn: today,
    summary: [
      `${sessionsCompleted} de ${sessionsPlanned} sesiones completadas (${Math.round(adherence * 100)} %).`,
      strong.length > 0 ? `Progresión clara en: ${strong.join(", ")}.` : "Ningún grupo destaca todavía con una progresión clara.",
      stalled.length > 0 ? `Progresión detenida en: ${stalled.join(", ")}.` : "Ningún grupo con la progresión detenida.",
      ...(unknown > 0 ? [`${unknown} grupos musculares sin datos suficientes para valorarlos.`] : []),
    ],
  };

  const limitations = await getLimitations(db);
  const level = determineLevel({
    experience: profile.experience,
    structuredProgram: profile.structuredProgram,
    tracksLoads: profile.tracksLoads,
    marks: profile.strengthMarks,
    bodyWeightKg: insights.weights[insights.weights.length - 1]?.kg ?? 0,
    sex: profile.sex,
  });

  try {
    await db.transaction(async (tx) => {
      await saveBlockEvaluation(tx, block.id, evaluation);
      await createBlockFromProfile(tx, profile, limitations, {
        levelReasons: level.reasons,
        startedOn: today,
        carry: {
          changes: decision.changes,
          volumeAdjust: decision.volumeAdjust,
          avoidExercises: [...new Set([...(block.rationale.avoidExercises ?? []), ...decision.avoidExercises])],
          deload: decision.deload,
        },
      });
    });
  } catch (error) {
    return planFailure(error);
  }
  return ok(undefined);
}

/* ───────────────────────────── Borrar todo ───────────────────────────── */

/** Borra todos los datos de la base de datos (las fotos se borran aparte, en `photos.ts`). */
export async function deleteAllData(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    for (const table of USER_TABLES) await tx.run(`delete from ${table}`);
  });
}
