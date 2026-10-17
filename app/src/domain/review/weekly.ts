import { addDays } from "@/lib/dates";
import { performanceScore, setsByMuscle, type Log } from "../analysis/muscles";
import type { WeightEntry, WeightTrend } from "../body/trend";
import { exerciseName, getExercise } from "../exercises";
import type { CalorieDecision } from "../nutrition/targets";
import type { VolumeRange } from "../training/plan";
import { MUSCLES, MUSCLE_LABEL, type Muscle } from "../types";

/**
 * Revisión semanal: convierte las respuestas del usuario y sus registros en un informe con reglas
 * explícitas. No cambia la rutina por una semana mala: solo propone lo que los datos justifican.
 */

export type CheckinAnswers = {
  workoutsCompleted: number;
  nutritionAdherence: number;
  sleepQuality: number;
  energy: number;
  appetite: number;
  performance: number;
  pain: boolean;
  painNotes: string;
  improvedExercises: string;
  difficulties: string;
  weightKg: number | null;
};

export type MuscleWeek = {
  muscle: Muscle;
  sets: number;
  target: VolumeRange;
  volume: "below" | "in_range" | "above" | "none";
  /** Comparación con la sesión anterior de los mismos ejercicios. */
  performance: "up" | "flat" | "down" | "unknown";
};

export type ReviewChange = {
  area: "training" | "nutrition" | "recovery" | "tracking";
  title: string;
  detail: string;
  evidence: string[];
  /** Ajuste de calorías que el usuario puede aplicar con un toque. */
  calorieDelta?: number;
};

export type WeeklyReport = {
  weekStart: string;
  weekEnd: string;
  summary: string[];
  weight: { text: string; currentKg: number | null; deltaKg: number | null; trendKgPerWeek: number | null };
  muscles: MuscleWeek[];
  goals: { label: string; met: boolean; detail: string }[];
  problems: string[];
  changes: ReviewChange[];
  nextGoals: string[];
};

export type WeeklyInput = {
  weekStart: string;
  answers: CheckinAnswers;
  plannedSessions: number;
  /** Sesiones registradas en la aplicación durante la semana. */
  loggedSessions: number;
  weekLogs: Log[];
  /** Registros anteriores a la semana, del más reciente al más antiguo. */
  priorLogs: Log[];
  volumeTargets: Record<Muscle, VolumeRange>;
  priorityMuscles: Muscle[];
  weights: WeightEntry[];
  trend: WeightTrend;
  calorieDecision: CalorieDecision;
  proteinTargetG: number | null;
  /** Revisiones anteriores, de la más reciente a la más antigua. */
  previous: { weekStart: string; energy: number; sleepQuality: number; performance: number; pain: boolean }[];
  formatWeight: (kg: number) => string;
};

// Valoraciones del 1 al 5 en palabras, concordando con lo que se valora.
const ADHERENCE = ["", "muy bajo", "bajo", "medio", "bueno", "muy bueno"];
const QUALITY = ["", "muy malo", "malo", "normal", "bueno", "muy bueno"];
const ENERGY = ["", "muy baja", "baja", "normal", "buena", "muy buena"];

export function buildWeeklyReport(input: WeeklyInput): WeeklyReport {
  const { answers, plannedSessions, formatWeight } = input;
  const weekEnd = addDays(input.weekStart, 6);
  const sessions = Math.max(answers.workoutsCompleted, input.loggedSessions);
  const adherence = plannedSessions > 0 ? sessions / plannedSessions : 0;
  const lowRecovery = answers.sleepQuality <= 2 || answers.energy <= 2;

  /* 1. Resumen */
  const summary: string[] = [
    `Has completado ${sessions} de ${plannedSessions} entrenamientos previstos.`,
    `Alimentación: cumplimiento ${ADHERENCE[answers.nutritionAdherence]} · sueño ${QUALITY[answers.sleepQuality]} · energía ${ENERGY[answers.energy]} · rendimiento ${QUALITY[answers.performance]}.`,
  ];
  if (input.loggedSessions < answers.workoutsCompleted) {
    summary.push(
      `Indicas ${answers.workoutsCompleted} entrenamientos, pero solo hay ${input.loggedSessions} registrados en la aplicación: sin las series anotadas no puedo valorar la progresión de esas sesiones.`,
    );
  }
  if (answers.improvedExercises.trim()) summary.push(`Has notado mejora en: ${answers.improvedExercises.trim()}.`);

  /* 2. Peso */
  const inWeek = input.weights.filter((entry) => entry.date >= input.weekStart && entry.date <= weekEnd);
  const before = input.weights.filter((entry) => entry.date < input.weekStart);
  const avg = (entries: WeightEntry[]) => (entries.length === 0 ? null : entries.reduce((sum, entry) => sum + entry.kg, 0) / entries.length);
  // Si la revisión se hace el lunes siguiente, el peso indicado en ella cuenta para la semana revisada.
  const currentKg = avg(inWeek) ?? answers.weightKg;
  const lastWeek = avg(before.filter((entry) => entry.date >= addDays(input.weekStart, -7)));
  const deltaKg = currentKg !== null && lastWeek !== null ? currentKg - lastWeek : null;
  const trendKgPerWeek = input.trend.status === "ok" ? input.trend.kgPerWeek : null;
  let weightText: string;
  if (currentKg === null) weightText = "No hay ninguna pesada esta semana. Sin ella no se puede seguir la tendencia.";
  else if (deltaKg === null) weightText = `Peso de la semana: ${formatWeight(currentKg)}. Aún no hay una semana anterior con la que comparar.`;
  else {
    weightText = `Peso de la semana: ${formatWeight(currentKg)} (${deltaKg >= 0 ? "+" : "−"}${formatWeight(Math.abs(deltaKg))} respecto a la anterior).`;
  }
  if (input.trend.status === "ok") {
    weightText += ` Tendencia de las últimas semanas: ${trendKgPerWeek! >= 0 ? "+" : "−"}${formatWeight(Math.abs(trendKgPerWeek!))} por semana.`;
  } else if (currentKg !== null) {
    weightText += ` ${input.trend.needed}`;
  }

  /* 3. Rendimiento por grupos musculares */
  const weekSets = setsByMuscle(input.weekLogs);
  const priorByExercise = new Map<string, Log>();
  for (const log of input.priorLogs) if (!priorByExercise.has(log.exerciseId)) priorByExercise.set(log.exerciseId, log);

  const deltas = new Map<Muscle, number[]>();
  const improved: string[] = [];
  const worsened: string[] = [];
  const bestThisWeek = new Map<string, Log>();
  for (const log of input.weekLogs) {
    const current = bestThisWeek.get(log.exerciseId);
    if (!current || performanceScore(log) > performanceScore(current)) bestThisWeek.set(log.exerciseId, log);
  }
  for (const [exerciseId, log] of bestThisWeek) {
    const exercise = getExercise(exerciseId);
    const prior = priorByExercise.get(exerciseId);
    if (!exercise || !prior) continue;
    const previousScore = performanceScore(prior);
    if (previousScore <= 0) continue;
    const delta = ((performanceScore(log) - previousScore) / previousScore) * 100;
    deltas.set(exercise.primary, [...(deltas.get(exercise.primary) ?? []), delta]);
    if (delta > 0.5) improved.push(exerciseName(exerciseId));
    else if (delta < -1.5) worsened.push(exerciseName(exerciseId));
  }

  const muscles: MuscleWeek[] = MUSCLES.map((muscle) => {
    const sets = Math.round(weekSets[muscle] * 10) / 10;
    const target = input.volumeTargets[muscle];
    const list = deltas.get(muscle) ?? [];
    const mean = list.length > 0 ? list.reduce((a, b) => a + b, 0) / list.length : null;
    return {
      muscle,
      sets,
      target,
      volume: sets === 0 ? "none" : sets < target.min ? "below" : sets > target.max ? "above" : "in_range",
      performance: mean === null ? "unknown" : mean > 0.5 ? "up" : mean < -1.5 ? "down" : "flat",
    };
  });
  if (improved.length > 0) summary.push(`Mejoras registradas respecto a la sesión anterior: ${improved.slice(0, 5).join(", ")}.`);

  /* 4. Cumplimiento de objetivos */
  const goals = [
    { label: "Entrenamientos", met: adherence >= 1, detail: `${sessions} de ${plannedSessions}` },
    { label: "Alimentación", met: answers.nutritionAdherence >= 4, detail: `cumplimiento ${ADHERENCE[answers.nutritionAdherence]}` },
    { label: "Descanso", met: answers.sleepQuality >= 3, detail: `sueño ${QUALITY[answers.sleepQuality]}` },
    { label: "Peso semanal registrado", met: currentKg !== null, detail: currentKg !== null ? formatWeight(currentKg) : "sin pesada" },
  ];

  /* 5. Problemas detectados */
  const problems: string[] = [];
  if (adherence < 0.75) problems.push(`Has completado menos del 75 % de los entrenamientos previstos (${sessions} de ${plannedSessions}).`);
  if (answers.pain) problems.push(`Dolor o molestias${answers.painNotes.trim() ? `: ${answers.painNotes.trim()}` : ""}.`);
  if (answers.sleepQuality <= 2) problems.push("Sueño insuficiente o de mala calidad.");
  if (answers.energy <= 2) problems.push("Energía baja durante la semana.");
  if (answers.nutritionAdherence <= 2) problems.push("La alimentación ha quedado lejos del plan.");
  if (worsened.length > 0) problems.push(`Rendimiento más bajo que en la sesión anterior en: ${worsened.slice(0, 4).join(", ")}.`);
  const belowPriority = muscles.filter((item) => input.priorityMuscles.includes(item.muscle) && item.volume === "below" && adherence >= 0.75);
  if (belowPriority.length > 0) {
    problems.push(`Volumen semanal por debajo del rango en grupos prioritarios: ${belowPriority.map((item) => MUSCLE_LABEL[item.muscle].toLowerCase()).join(", ")}.`);
  }
  if (answers.difficulties.trim()) problems.push(`Lo más difícil según tú: ${answers.difficulties.trim()}.`);

  /* 6. Cambios recomendados */
  const changes: ReviewChange[] = [];
  if (answers.pain) {
    changes.push({
      area: "training",
      title: "No entrenes a través del dolor",
      detail:
        "En los ejercicios que molesten, usa una alternativa que no duela o reduce la carga, y anota la molestia en el modo entrenamiento para que no suba el peso. Si el dolor es intenso, dura más de unos días o empeora, consulta a un profesional sanitario antes de volver a cargar esa zona.",
      evidence: [`Has indicado dolor o molestias esta semana${answers.painNotes.trim() ? ` (${answers.painNotes.trim()})` : ""}.`],
    });
  }
  if (adherence < 0.75) {
    changes.push({
      area: "training",
      title: "Antes que cambiar la rutina, recuperar la regularidad",
      detail: `Si ${plannedSessions} días no encajan en tu semana, reduce los días en el perfil: una rutina de menos días que se cumple funciona mejor que una ideal a medias. La rutina actual no se modifica por una semana irregular.`,
      evidence: [`${sessions} de ${plannedSessions} entrenamientos completados.`],
    });
  }
  const twoBadWeeks = lowRecovery && input.previous[0] !== undefined && (input.previous[0].sleepQuality <= 2 || input.previous[0].energy <= 2);
  if (lowRecovery) {
    changes.push({
      area: "recovery",
      title: twoBadWeeks ? "Dos semanas seguidas de mala recuperación" : "Prioriza la recuperación esta semana",
      detail: twoBadWeeks
        ? "Durante la próxima semana mantén las cargas (sin intentar subirlas) y quita una serie de cada ejercicio accesorio. Si al final del bloque sigue igual, tocará una semana de descarga."
        : "Las cargas no subirán automáticamente mientras el sueño o la energía sigan bajos. Intenta adelantar la hora de acostarte y no añadas trabajo extra.",
      evidence: [`Sueño ${QUALITY[answers.sleepQuality]} y energía ${ENERGY[answers.energy]} esta semana.`],
    });
  }
  const decision = input.calorieDecision;
  if (decision.action === "increase" || decision.action === "decrease") {
    changes.push({ area: "nutrition", title: decision.title, detail: decision.reason, evidence: [weightText], calorieDelta: decision.deltaKcal });
  } else if (answers.nutritionAdherence <= 2) {
    changes.push({
      area: "nutrition",
      title: "Acercarse al plan de alimentación actual",
      detail:
        "Antes de tocar las calorías hay que cumplir las actuales. Elige una sola mejora para esta semana: por ejemplo, asegurar la proteína en el desayuno o añadir un tentempié fijo." +
        (input.proteinTargetG ? ` Tu objetivo de proteína es de unos ${input.proteinTargetG} g al día.` : ""),
      evidence: [`Cumplimiento de la alimentación: ${ADHERENCE[answers.nutritionAdherence]}.`],
    });
  }
  if (currentKg === null) {
    changes.push({
      area: "tracking",
      title: "Pésate una vez por semana",
      detail: "Por la mañana, después de ir al baño y antes de comer. Sin ese dato no es posible ajustar las calorías con criterio.",
      evidence: ["No hay ninguna pesada registrada esta semana."],
    });
  }

  /* 7. Objetivos para la semana siguiente */
  const nextGoals: string[] = [`Completar los ${plannedSessions} entrenamientos previstos y registrar todas las series.`];
  const flat = muscles.filter((item) => item.performance !== "up" && item.performance !== "unknown" && input.priorityMuscles.includes(item.muscle));
  if (!lowRecovery && !answers.pain && flat.length > 0) {
    nextGoals.push(`Sumar al menos una repetición en los ejercicios de ${flat.slice(0, 3).map((item) => MUSCLE_LABEL[item.muscle].toLowerCase()).join(", ")}.`);
  } else if (!lowRecovery && !answers.pain) {
    nextGoals.push("Sumar una repetición o el salto mínimo de carga donde la sugerencia del modo entrenamiento lo indique.");
  }
  if (lowRecovery) nextGoals.push("Dormir al menos 7 horas la mayoría de las noches.");
  if (answers.nutritionAdherence <= 3) nextGoals.push("Cumplir el objetivo de calorías y proteína al menos 5 días.");
  if (currentKg === null) nextGoals.push("Registrar el peso el día que tienes fijado.");

  return {
    weekStart: input.weekStart,
    weekEnd,
    summary,
    weight: { text: weightText, currentKg, deltaKg, trendKgPerWeek },
    muscles,
    goals,
    problems,
    changes,
    nextGoals,
  };
}
