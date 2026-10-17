import { MEASURES, type Measure } from "@/domain/types";
import type { OnboardingInput } from "@/features/profile/schema";

/** Datos de ejemplo para las pruebas de la capa de datos. No se usa en la app. */

export function measurements(values: Partial<Record<Measure, number>> = {}): Record<Measure, number | null> {
  return Object.fromEntries(MEASURES.map((measure) => [measure, values[measure] ?? null])) as Record<Measure, number | null>;
}

/** El perfil de ejemplo del encargo original. */
export function onboardingInput(): OnboardingInput {
  return {
    displayName: "Miquel",
    ageYears: 25,
    sex: "male",
    heightCm: 180.5,
    country: "España",
    units: "metric",
    primaryGoal: "muscle_gain",
    secondaryGoals: ["strength", "proportions"],
    priorityMuscles: ["biceps", "triceps", "forearms", "quads", "hamstrings", "glutes", "calves"],
    targetDate: null,
    experience: "lt6m",
    structuredProgram: false,
    tracksLoads: false,
    previousRoutines: "",
    favoriteExercises: [],
    dislikedExercises: [],
    strengthMarks: [],
    weakMuscles: ["biceps"],
    mobilityNotes: "",
    daysPerWeek: 5,
    trainingWeekdays: [],
    sessionMinutes: 75,
    equipment: ["barbell", "dumbbells", "machines", "cables", "bench", "pullup_bar"],
    sleepHours: 7.5,
    dailySteps: 7000,
    jobActivity: "sedentary",
    stressLevel: "medium",
    mealsPerDay: 4,
    appetite: "low",
    dietPreference: "omnivore",
    allergies: [],
    intoleranceNotes: "",
    favoriteFoods: "",
    excludedFoods: "",
    weeklyFoodBudget: null,
    supplements: "",
    weightKg: 68,
    measurements: measurements({ arm_flexed: 31, thigh: 52, waist: 76 }),
    limitations: [{ kind: "pain", bodyArea: "shoulder", severity: "mild", description: "Molestia leve al hacer press" }],
  };
}
