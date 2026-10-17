import { MARK_LIFTS, type MarkLift } from "@/domain/training/level";
import {
  MEASURES,
  MEASURE_LABEL,
  type Allergen,
  type Appetite,
  type Diet,
  type Equipment,
  type Experience,
  type Goal,
  type JobActivity,
  type Measure,
  type Muscle,
  type SecondaryGoal,
  type Sex,
  type Stress,
  type Units,
} from "@/domain/types";
import { MEASURE_RANGE, type LimitationInput, type Measurements, type OnboardingInput, type ProfileInput } from "@/features/profile/schema";
import { fromDisplayLength, fromDisplayWeight, lengthUnit, parseDecimal, roundDisplay, toDisplayLength, toDisplayWeight } from "@/lib/units";

/**
 * Estado del formulario del perfil mientras se edita. Los números se guardan como texto (lo que el
 * usuario escribe, en sus unidades) y solo se convierten a sistema métrico al enviar.
 */
export type Draft = {
  displayName: string;
  age: string;
  sex: Sex | null;
  height: string;
  weight: string;
  country: string;
  units: Units;

  primaryGoal: Goal | null;
  secondaryGoals: SecondaryGoal[];
  priorityMuscles: Muscle[];
  targetDate: string;

  experience: Experience | null;
  structuredProgram: boolean;
  tracksLoads: boolean;
  previousRoutines: string;
  marks: Record<MarkLift, { weight: string; reps: string }>;
  weakMuscles: Muscle[];
  favoriteExercises: string[];
  dislikedExercises: string[];

  daysPerWeek: number | null;
  trainingWeekdays: number[];
  sessionMinutes: number | null;
  equipment: Equipment[];

  limitations: LimitationInput[];
  mobilityNotes: string;

  measures: Record<Measure, string>;

  sleepHours: string;
  dailySteps: string;
  jobActivity: JobActivity | null;
  stressLevel: Stress | null;

  mealsPerDay: number | null;
  appetite: Appetite | null;
  dietPreference: Diet | null;
  allergies: Allergen[];
  intoleranceNotes: string;
  favoriteFoods: string;
  excludedFoods: string;
  weeklyFoodBudget: string;
  supplements: string;
};

export function emptyDraft(): Draft {
  return {
    displayName: "",
    age: "",
    sex: null,
    height: "",
    weight: "",
    country: "",
    units: "metric",
    primaryGoal: null,
    secondaryGoals: [],
    priorityMuscles: [],
    targetDate: "",
    experience: null,
    structuredProgram: false,
    tracksLoads: false,
    previousRoutines: "",
    marks: Object.fromEntries(MARK_LIFTS.map((lift) => [lift, { weight: "", reps: "" }])) as Draft["marks"],
    weakMuscles: [],
    favoriteExercises: [],
    dislikedExercises: [],
    daysPerWeek: null,
    trainingWeekdays: [],
    sessionMinutes: null,
    equipment: [],
    limitations: [],
    mobilityNotes: "",
    measures: Object.fromEntries(MEASURES.map((measure) => [measure, ""])) as Draft["measures"],
    sleepHours: "",
    dailySteps: "",
    jobActivity: null,
    stressLevel: null,
    mealsPerDay: null,
    appetite: null,
    dietPreference: null,
    allergies: [],
    intoleranceNotes: "",
    favoriteFoods: "",
    excludedFoods: "",
    weeklyFoodBudget: "",
    supplements: "",
  };
}

const show = (value: number | null, digits = 1) => (value === null ? "" : String(roundDisplay(value, digits)).replace(".", ","));

/** Rellena el formulario con un perfil ya guardado (pantalla de Perfil). */
export function draftFromProfile(profile: ProfileInput, limitations: LimitationInput[] = []): Draft {
  const draft = emptyDraft();
  for (const mark of profile.strengthMarks) {
    draft.marks[mark.lift] = { weight: show(toDisplayWeight(mark.weightKg, profile.units)), reps: String(mark.reps) };
  }
  return {
    ...draft,
    displayName: profile.displayName,
    age: String(profile.ageYears),
    sex: profile.sex,
    height: show(toDisplayLength(profile.heightCm, profile.units)),
    country: profile.country,
    units: profile.units,
    primaryGoal: profile.primaryGoal,
    secondaryGoals: profile.secondaryGoals,
    priorityMuscles: profile.priorityMuscles,
    targetDate: profile.targetDate ?? "",
    experience: profile.experience,
    structuredProgram: profile.structuredProgram,
    tracksLoads: profile.tracksLoads,
    previousRoutines: profile.previousRoutines,
    weakMuscles: profile.weakMuscles,
    favoriteExercises: profile.favoriteExercises,
    dislikedExercises: profile.dislikedExercises,
    daysPerWeek: profile.daysPerWeek,
    trainingWeekdays: profile.trainingWeekdays,
    sessionMinutes: profile.sessionMinutes,
    equipment: profile.equipment,
    limitations,
    mobilityNotes: profile.mobilityNotes,
    sleepHours: show(profile.sleepHours),
    dailySteps: profile.dailySteps === null ? "" : String(profile.dailySteps),
    jobActivity: profile.jobActivity,
    stressLevel: profile.stressLevel,
    mealsPerDay: profile.mealsPerDay,
    appetite: profile.appetite,
    dietPreference: profile.dietPreference,
    allergies: profile.allergies,
    intoleranceNotes: profile.intoleranceNotes,
    favoriteFoods: profile.favoriteFoods,
    excludedFoods: profile.excludedFoods,
    weeklyFoodBudget: show(profile.weeklyFoodBudget, 2),
    supplements: profile.supplements,
  };
}

export type StepId =
  | "personal"
  | "goals"
  | "experience"
  | "exercises"
  | "availability"
  | "limitations"
  | "measures"
  | "habits"
  | "nutrition";

const optionalNumber = (text: string): number | null | "invalid" => {
  if (text.trim() === "") return null;
  return parseDecimal(text) ?? "invalid";
};

/** Comprueba un paso. Devuelve el primer problema encontrado o null si está todo bien. */
export function validateStep(step: StepId, draft: Draft, options: { requireWeight: boolean } = { requireWeight: true }): string | null {
  switch (step) {
    case "personal": {
      if (!draft.displayName.trim()) return "Dime cómo quieres que te llame.";
      const age = parseDecimal(draft.age);
      if (age === null || !Number.isInteger(age)) return "Indica tu edad en años.";
      if (age < 16) return "La aplicación está pensada para mayores de 16 años.";
      if (age > 100) return "Revisa la edad.";
      if (!draft.sex) return "Elige una opción en «Sexo» (puedes elegir «Prefiero no decirlo»).";
      const height = parseDecimal(draft.height);
      if (height === null) return "Indica tu altura.";
      const heightCm = fromDisplayLength(height, draft.units);
      if (heightCm < 120 || heightCm > 230) return `Revisa la altura: debe estar en ${lengthUnit(draft.units)}.`;
      if (options.requireWeight) {
        const weight = parseDecimal(draft.weight);
        if (weight === null) return "Indica tu peso actual.";
        const kg = fromDisplayWeight(weight, draft.units);
        if (kg < 30 || kg > 300) return "Revisa el peso.";
      }
      return null;
    }
    case "goals":
      if (!draft.primaryGoal) return "Elige tu objetivo principal.";
      return null;
    case "experience": {
      if (!draft.experience) return "Indica cuánto tiempo llevas entrenando.";
      for (const lift of MARK_LIFTS) {
        const { weight, reps } = draft.marks[lift];
        if (!weight.trim() && !reps.trim()) continue;
        const w = parseDecimal(weight);
        const r = parseDecimal(reps);
        if (w === null || r === null || !Number.isInteger(r) || w <= 0 || r < 1 || r > 30) {
          return "En las marcas de fuerza, indica el peso y las repeticiones (1-30) o deja ambos campos vacíos.";
        }
      }
      return null;
    }
    case "exercises":
      if (draft.favoriteExercises.some((id) => draft.dislikedExercises.includes(id))) {
        return "Hay algún ejercicio marcado a la vez como favorito y como no deseado.";
      }
      return null;
    case "availability":
      if (!draft.daysPerWeek) return "Indica cuántos días puedes entrenar a la semana.";
      if (draft.trainingWeekdays.length > 0 && draft.trainingWeekdays.length !== draft.daysPerWeek) {
        return `Has dicho ${draft.daysPerWeek} días por semana: marca exactamente ${draft.daysPerWeek} días o no marques ninguno.`;
      }
      if (!draft.sessionMinutes) return "Indica cuánto puede durar cada sesión.";
      if (draft.equipment.length === 0) return "Marca el material que tienes disponible.";
      return null;
    case "limitations":
      return null;
    case "measures":
      for (const measure of MEASURES) {
        const value = optionalNumber(draft.measures[measure]);
        if (value === null) continue;
        if (value === "invalid") return `Revisa el valor de «${MEASURE_LABEL[measure]}».`;
        const cm = fromDisplayLength(value, draft.units);
        const [min, max] = MEASURE_RANGE[measure];
        if (cm < min || cm > max) return `«${MEASURE_LABEL[measure]}» parece fuera de rango. Compruébalo o déjalo en blanco.`;
      }
      return null;
    case "habits": {
      const sleep = optionalNumber(draft.sleepHours);
      if (sleep === "invalid" || (sleep !== null && (sleep < 3 || sleep > 12))) return "Revisa las horas de sueño (entre 3 y 12).";
      const steps = optionalNumber(draft.dailySteps);
      if (steps === "invalid" || (steps !== null && (steps < 0 || steps > 40000))) return "Revisa los pasos diarios.";
      if (!draft.jobActivity) return "Indica cómo es tu actividad en el trabajo.";
      if (!draft.stressLevel) return "Indica tu nivel de estrés habitual.";
      return null;
    }
    case "nutrition": {
      if (!draft.mealsPerDay) return "Indica cuántas comidas haces al día.";
      if (!draft.appetite) return "Indica si te cuesta comer suficiente.";
      if (!draft.dietPreference) return "Elige tu tipo de alimentación.";
      const budget = optionalNumber(draft.weeklyFoodBudget);
      if (budget === "invalid" || (budget !== null && (budget < 0 || budget > 2000))) return "Revisa el presupuesto semanal.";
      return null;
    }
  }
}

const numberOrNull = (text: string): number | null => (text.trim() === "" ? null : parseDecimal(text));

export function measurementsFromDraft(draft: Pick<Draft, "measures" | "units">): Measurements {
  return Object.fromEntries(
    MEASURES.map((measure) => {
      const value = numberOrNull(draft.measures[measure]);
      return [measure, value === null ? null : roundDisplay(fromDisplayLength(value, draft.units), 1)];
    }),
  ) as Measurements;
}

/** Convierte el borrador (ya validado paso a paso) en los datos de perfil, en sistema métrico. */
export function profileFromDraft(draft: Draft): ProfileInput {
  const steps = numberOrNull(draft.dailySteps);
  return {
    displayName: draft.displayName.trim(),
    ageYears: parseDecimal(draft.age) ?? 0,
    sex: draft.sex ?? "unspecified",
    heightCm: roundDisplay(fromDisplayLength(parseDecimal(draft.height) ?? 0, draft.units), 1),
    country: draft.country.trim(),
    units: draft.units,
    primaryGoal: draft.primaryGoal ?? "muscle_gain",
    secondaryGoals: draft.secondaryGoals,
    priorityMuscles: draft.priorityMuscles,
    targetDate: draft.targetDate || null,
    experience: draft.experience ?? "none",
    structuredProgram: draft.structuredProgram,
    tracksLoads: draft.tracksLoads,
    previousRoutines: draft.previousRoutines.trim(),
    favoriteExercises: draft.favoriteExercises,
    dislikedExercises: draft.dislikedExercises,
    strengthMarks: MARK_LIFTS.flatMap((lift) => {
      const weight = parseDecimal(draft.marks[lift].weight);
      const reps = parseDecimal(draft.marks[lift].reps);
      if (weight === null || reps === null) return [];
      return [{ lift, weightKg: roundDisplay(fromDisplayWeight(weight, draft.units), 1), reps }];
    }),
    weakMuscles: draft.weakMuscles,
    mobilityNotes: draft.mobilityNotes.trim(),
    daysPerWeek: draft.daysPerWeek ?? 3,
    trainingWeekdays: draft.trainingWeekdays,
    sessionMinutes: draft.sessionMinutes ?? 60,
    equipment: draft.equipment,
    sleepHours: numberOrNull(draft.sleepHours),
    dailySteps: steps === null ? null : Math.round(steps),
    jobActivity: draft.jobActivity ?? "sedentary",
    stressLevel: draft.stressLevel ?? "medium",
    mealsPerDay: draft.mealsPerDay ?? 4,
    appetite: draft.appetite ?? "normal",
    dietPreference: draft.dietPreference ?? "omnivore",
    allergies: draft.allergies,
    intoleranceNotes: draft.intoleranceNotes.trim(),
    favoriteFoods: draft.favoriteFoods.trim(),
    excludedFoods: draft.excludedFoods.trim(),
    weeklyFoodBudget: numberOrNull(draft.weeklyFoodBudget),
    supplements: draft.supplements.trim(),
  };
}

export function onboardingFromDraft(draft: Draft): OnboardingInput {
  return {
    ...profileFromDraft(draft),
    weightKg: roundDisplay(fromDisplayWeight(parseDecimal(draft.weight) ?? 0, draft.units), 2),
    measurements: measurementsFromDraft(draft),
    limitations: draft.limitations,
  };
}
