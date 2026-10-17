import type { WeightTrend } from "../body/trend";
import type { Appetite, Goal, JobActivity, Level, MacroStyle, Sex } from "../types";

/**
 * Objetivos nutricionales. Son ESTIMACIONES: las fórmulas de gasto energético tienen un error
 * individual de ±10 % o más. El valor inicial es un punto de partida que se corrige con la evolución
 * real del peso, nunca con una sola pesada.
 *
 * De SnapCal se incorporan los mínimos de seguridad de calorías y los repartos bajo en hidratos y
 * cetogénico. Es la única fuente del objetivo diario de la app combinada.
 */

export type NutritionInput = {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  jobActivity: JobActivity;
  dailySteps: number | null;
  trainingDays: number;
  sessionMinutes: number;
  goal: Goal;
  level: Level;
  appetite: Appetite;
  /** Reparto de macros; si falta, el normal. */
  macroStyle?: MacroStyle;
};

/** Mínimo de calorías diarias por debajo del cual la app no propone nada (de SnapCal). */
const MIN_CALORIES: Record<Sex, number> = { male: 1500, female: 1200, unspecified: 1350 };

export function calorieFloor(sex: Sex): number {
  return MIN_CALORIES[sex];
}

/** Parte de las calorías que va a hidratos en los repartos especiales (el resto lo cubre la grasa). */
const CARB_SHARE: Record<Exclude<MacroStyle, "standard">, number> = { lowcarb: 0.25, keto: 0.05 };

export type NutritionEstimate = {
  bmr: number;
  activityFactor: number;
  /** Gasto diario estimado y su margen de error razonable. */
  maintenance: number;
  maintenanceRange: [number, number];
  /** Diferencia diaria respecto al mantenimiento (positiva = superávit). */
  adjustment: number;
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  proteinPerKg: number;
  /** Ritmo semanal de cambio de peso que se busca, en % del peso corporal. */
  targetRatePct: [number, number];
  macroStyle: MacroStyle;
  /** Si el objetivo se ha subido hasta el mínimo de seguridad. */
  limitedToFloor: boolean;
  notes: string[];
};

const JOB_FACTOR: Record<JobActivity, number> = { sedentary: 1.2, light: 1.35, active: 1.5, very_active: 1.7 };

/** Metabolismo basal con la ecuación de Mifflin-St Jeor. */
export function basalMetabolicRate(sex: Sex, weightKg: number, heightCm: number, ageYears: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  // Sin sexo indicado se usa el punto medio entre las dos constantes de la ecuación (+5 y −161).
  return base + (sex === "male" ? 5 : sex === "female" ? -161 : -78);
}

export function activityFactor(input: Pick<NutritionInput, "jobActivity" | "dailySteps" | "trainingDays" | "sessionMinutes">): number {
  let factor = JOB_FACTOR[input.jobActivity];
  // Los pasos solo suman en trabajos sedentarios o ligeros: en los activos ya están contados.
  if (input.dailySteps !== null && (input.jobActivity === "sedentary" || input.jobActivity === "light")) {
    if (input.dailySteps >= 12000) factor += 0.15;
    else if (input.dailySteps >= 8000) factor += 0.1;
    else if (input.dailySteps >= 5000) factor += 0.05;
  }
  factor += 0.035 * input.trainingDays * Math.min(1.5, input.sessionMinutes / 60);
  return Math.min(2.2, Math.round(factor * 100) / 100);
}

/** Ritmo semanal razonable de cambio de peso (% del peso corporal) según objetivo y nivel. */
export function targetRate(goal: Goal, level: Level): [number, number] {
  switch (goal) {
    case "muscle_gain":
      return level === "beginner" ? [0.25, 0.5] : level === "intermediate" ? [0.2, 0.35] : [0.1, 0.25];
    case "strength":
      return [0, 0.25];
    case "fat_loss":
      return [-1, -0.5];
    default:
      return [-0.1, 0.1];
  }
}

const round = (value: number, step: number) => Math.round(value / step) * step;

export function estimateNutrition(input: NutritionInput): NutritionEstimate {
  const bmr = basalMetabolicRate(input.sex, input.weightKg, input.heightCm, input.ageYears);
  const factor = activityFactor(input);
  const maintenance = bmr * factor;
  const notes: string[] = [];

  let adjustment = 0;
  let proteinPerKg = 1.8;
  switch (input.goal) {
    case "muscle_gain":
      adjustment = input.level === "beginner" ? 300 : input.level === "intermediate" ? 250 : 200;
      notes.push(
        "Superávit moderado: suficiente para ganar músculo sin acumular grasa innecesaria. Un superávit mayor no acelera la ganancia muscular.",
      );
      break;
    case "strength":
      adjustment = 150;
      break;
    case "fat_loss":
      adjustment = -Math.round(Math.min(500, maintenance * 0.18));
      proteinPerKg = 2.1;
      notes.push("Déficit moderado con proteína alta para conservar la masa muscular mientras pierdes grasa.");
      break;
    case "recomposition":
      proteinPerKg = 2;
      notes.push("Calorías de mantenimiento con proteína alta: el cambio de composición es lento y se mide mejor con medidas que con la báscula.");
      break;
    case "maintenance":
      proteinPerKg = 1.6;
      break;
  }

  const floor = calorieFloor(input.sex);
  const planned = round(maintenance + adjustment, 50);
  const limitedToFloor = planned < floor;
  const calories = Math.max(planned, floor);
  if (limitedToFloor) {
    adjustment = calories - round(maintenance, 10);
    notes.push(
      `El objetivo se queda en ${floor} kcal, el mínimo de seguridad: con menos es difícil cubrir las necesidades de nutrientes. Si quieres perder grasa más deprisa, mejor con más actividad que comiendo menos.`,
    );
  }

  const macroStyle = input.macroStyle ?? "standard";
  const proteinG = round(input.weightKg * proteinPerKg, 5);
  let fatG: number;
  let carbsG: number;
  if (macroStyle === "standard") {
    // Grasa: ~0,9 g/kg, sin bajar del 20 % de las calorías.
    fatG = round(Math.max(input.weightKg * 0.9, (calories * 0.2) / 9), 5);
    carbsG = Math.max(0, round((calories - proteinG * 4 - fatG * 9) / 4, 5));
  } else {
    // Hidratos fijados por el reparto; la grasa cubre el resto (al menos 0,6 g/kg).
    const plannedCarbs = round((calories * CARB_SHARE[macroStyle]) / 4, 5);
    fatG = round(Math.max(input.weightKg * 0.6, (calories - proteinG * 4 - plannedCarbs * 4) / 9), 5);
    carbsG = Math.max(0, Math.min(plannedCarbs, round((calories - proteinG * 4 - fatG * 9) / 4, 5)));
    notes.push(
      macroStyle === "keto"
        ? "Reparto cetogénico: unos 5 % de las calorías en hidratos y el resto en grasa, con la misma proteína. Las calorías no cambian."
        : "Reparto bajo en hidratos: unos 25 % de las calorías en hidratos y más grasa, con la misma proteína. Las calorías no cambian.",
    );
  }

  if (input.sex === "unspecified") {
    notes.push("No has indicado tu sexo: se usa un valor intermedio en la fórmula del metabolismo, lo que amplía el margen de error.");
  }
  if (input.dailySteps === null) {
    notes.push("No has indicado tus pasos diarios: la actividad se estima solo con tu tipo de trabajo y tus entrenamientos.");
  }
  if (input.appetite === "low" && adjustment > 0) {
    notes.push(
      "Como te cuesta comer suficiente, reparte las calorías en más tomas y apóyate en alimentos densos y fáciles de comer (frutos secos, aceite de oliva, batidos caseros, arroz, pasta).",
    );
  }

  return {
    bmr: Math.round(bmr),
    activityFactor: factor,
    maintenance: round(maintenance, 10),
    maintenanceRange: [round(maintenance * 0.9, 50), round(maintenance * 1.1, 50)],
    adjustment,
    calories,
    proteinG,
    fatG,
    carbsG,
    proteinPerKg,
    targetRatePct: targetRate(input.goal, input.level),
    macroStyle,
    limitedToFloor,
    notes,
  };
}

export type CalorieDecision = {
  action: "keep" | "increase" | "decrease" | "wait";
  deltaKcal: number;
  title: string;
  reason: string;
};

export type AdjustmentContext = {
  trend: WeightTrend;
  goal: Goal;
  level: Level;
  /** Días desde el último cambio de calorías. */
  daysSinceLastChange: number;
  /** Media de adherencia a la alimentación (1-5) en las últimas revisiones; null si no hay revisiones. */
  nutritionAdherence: number | null;
  /** Crecimiento de la cintura (%) frente al del peso (%) entre las dos últimas mediciones, si existen. */
  waistVsWeight: { waistPct: number; weightPct: number } | null;
  /** Objetivo actual y sexo: con ellos no se propone bajar del mínimo de seguridad. */
  currentCalories?: number | null;
  sex?: Sex;
};

const STEP_KCAL = 125;
const MIN_DAYS_BETWEEN_CHANGES = 14;

/**
 * Decide si conviene tocar las calorías. Solo propone cambios pequeños, con tendencia de varias semanas
 * y cuando el plan se está cumpliendo: si no se cumple, el problema no son las calorías. Nunca propone
 * bajar del mínimo de seguridad.
 */
export function decideCalories(context: AdjustmentContext): CalorieDecision {
  const decision = decideCaloriesByTrend(context);
  if (decision.action !== "decrease" || context.currentCalories == null || !context.sex) return decision;
  const floor = calorieFloor(context.sex);
  if (context.currentCalories + decision.deltaKcal >= floor) return decision;
  return {
    action: "keep",
    deltaKcal: 0,
    title: "Ya estás en el mínimo de seguridad",
    reason: `${decision.reason} Pero tu objetivo es de ${context.currentCalories} kcal y bajarlo te dejaría por debajo del mínimo de seguridad (${floor} kcal). Si necesitas más déficit, mejor con más actividad diaria.`,
  };
}

function decideCaloriesByTrend(context: AdjustmentContext): CalorieDecision {
  const { trend } = context;
  const [low, high] = targetRate(context.goal, context.level);

  if (trend.status !== "ok") {
    return { action: "wait", deltaKcal: 0, title: "Todavía no hay tendencia", reason: trend.needed };
  }
  const rate = `${formatSigned(trend.kgPerWeek)} kg/semana (${formatSigned(trend.pctPerWeek)} %)`;

  if (context.daysSinceLastChange < MIN_DAYS_BETWEEN_CHANGES) {
    return {
      action: "wait",
      deltaKcal: 0,
      title: "Mantén las calorías actuales",
      reason: `Tu tendencia es de ${rate}. El último ajuste es de hace ${context.daysSinceLastChange} días: hacen falta al menos ${MIN_DAYS_BETWEEN_CHANGES} para valorar su efecto.`,
    };
  }
  if (context.nutritionAdherence !== null && context.nutritionAdherence < 3) {
    return {
      action: "wait",
      deltaKcal: 0,
      title: "Primero, cumplir el plan actual",
      reason: `Tu tendencia es de ${rate}, pero en tus últimas revisiones indicas que cumples la alimentación solo a medias. Antes de cambiar las calorías conviene acercarse al objetivo actual de forma constante.`,
    };
  }

  const waist = context.waistVsWeight;
  if (context.goal === "muscle_gain" && waist && waist.weightPct > 0 && waist.waistPct > waist.weightPct * 1.5 && waist.waistPct > 1.5) {
    return {
      action: "decrease",
      deltaKcal: -STEP_KCAL,
      title: `Reduce unas ${STEP_KCAL} kcal`,
      reason: `Tu cintura ha crecido un ${waist.waistPct.toFixed(1)} % mientras el peso subía un ${waist.weightPct.toFixed(1)} %: proporcionalmente más de lo deseable. Un pequeño recorte ayuda a que lo ganado sea sobre todo músculo.`,
    };
  }

  const wanted = `${formatSigned(low)} a ${formatSigned(high)} % semanal`;
  if (trend.pctPerWeek < low) {
    return {
      action: "increase",
      deltaKcal: STEP_KCAL,
      title: `Sube unas ${STEP_KCAL} kcal`,
      reason:
        context.goal === "fat_loss"
          ? `Tu tendencia es de ${rate}: pierdes peso más rápido de lo recomendable (${wanted}). Sube unas ${STEP_KCAL} kcal diarias para proteger tu masa muscular y tu rendimiento.`
          : `Tu tendencia es de ${rate}, por debajo del ritmo buscado (${wanted}). Añade unas ${STEP_KCAL} kcal diarias, sobre todo en forma de carbohidratos, y revísalo en dos semanas.`,
    };
  }
  if (trend.pctPerWeek > high) {
    return {
      action: "decrease",
      deltaKcal: -STEP_KCAL,
      title: `Reduce unas ${STEP_KCAL} kcal`,
      reason:
        context.goal === "fat_loss"
          ? `Tu tendencia es de ${rate}, más lenta que el ritmo buscado (${wanted}). Recorta unas ${STEP_KCAL} kcal diarias o aumenta tu actividad diaria, y revísalo en dos semanas.`
          : context.goal === "muscle_gain" || context.goal === "strength"
            ? `Tu tendencia es de ${rate}, por encima del ritmo buscado (${wanted}). Ir más rápido suele significar más grasa, no más músculo.`
            : `Tu tendencia es de ${rate}: el peso sube más de lo previsto para tu objetivo (${wanted}).`,
    };
  }
  return {
    action: "keep",
    deltaKcal: 0,
    title: "Vas al ritmo adecuado",
    reason: `Tu tendencia es de ${rate}, dentro del ritmo buscado (${formatSigned(low)} a ${formatSigned(high)} % semanal). No toques las calorías.`,
  };
}

function formatSigned(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("es-ES", { maximumFractionDigits: 2 })}`;
}
