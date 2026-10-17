import { z } from "zod";
import { EXERCISE_IDS } from "@/domain/exercises";
import { MARK_LIFTS } from "@/domain/training/level";
import {
  ALLERGENS,
  APPETITE,
  BODY_AREAS,
  DIETS,
  EQUIPMENT,
  EXPERIENCE,
  GOALS,
  JOB_ACTIVITY,
  LIMITATION_KINDS,
  MEASURES,
  MUSCLES,
  SECONDARY_GOALS,
  SEVERITIES,
  SEXES,
  STRESS,
  UNITS,
  type Measure,
} from "@/domain/types";
import { isIsoDate } from "@/lib/dates";

/**
 * Validación del perfil físico. Es la frontera de confianza: se ejecuta en el servidor con lo que
 * llega del navegador, y la interfaz reutiliza los mismos tipos. Todo en sistema métrico.
 */

const text = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres.`);
const isoDate = z.string().refine(isIsoDate, "Fecha no válida.");
const exerciseId = z.enum(EXERCISE_IDS as [string, ...string[]]);

/** Rango aceptado (en cm) para cada perímetro: descarta errores de escritura evidentes. */
export const MEASURE_RANGE: Record<Measure, [number, number]> = {
  neck: [20, 70],
  shoulders: [70, 180],
  chest: [60, 180],
  waist: [45, 200],
  hips: [60, 200],
  arm_relaxed: [15, 70],
  arm_flexed: [15, 75],
  forearm: [15, 55],
  wrist: [10, 30],
  thigh: [30, 110],
  calf: [20, 70],
};

export const measurementsSchema = z.object(
  Object.fromEntries(
    MEASURES.map((measure) => {
      const [min, max] = MEASURE_RANGE[measure];
      return [measure, z.number().min(min, `Mínimo ${min} cm.`).max(max, `Máximo ${max} cm.`).nullable()];
    }),
  ) as Record<Measure, z.ZodNullable<z.ZodNumber>>,
);
export type Measurements = z.infer<typeof measurementsSchema>;

export const limitationSchema = z.object({
  kind: z.enum(LIMITATION_KINDS),
  bodyArea: z.enum(BODY_AREAS),
  severity: z.enum(SEVERITIES),
  description: text(300),
});
export type LimitationInput = z.infer<typeof limitationSchema>;

export const strengthMarkSchema = z.object({
  lift: z.enum(MARK_LIFTS),
  weightKg: z.number().min(1).max(500),
  reps: z.number().int().min(1).max(30),
});

export const profileSchema = z.object({
  // Datos personales
  displayName: z.string().trim().min(1, "Dime cómo quieres que te llame.").max(40),
  ageYears: z
    .number("Indica tu edad.")
    .int("La edad debe ser un número entero.")
    .min(16, "La aplicación está pensada para mayores de 16 años.")
    .max(100),
  sex: z.enum(SEXES),
  heightCm: z.number("Indica tu altura.").min(120, "Revisa la altura.").max(230, "Revisa la altura."),
  country: text(60),
  units: z.enum(UNITS),

  // Objetivos
  primaryGoal: z.enum(GOALS),
  secondaryGoals: z.array(z.enum(SECONDARY_GOALS)).max(6),
  priorityMuscles: z.array(z.enum(MUSCLES)).max(11),
  targetDate: isoDate.nullable(),

  // Historial deportivo
  experience: z.enum(EXPERIENCE),
  structuredProgram: z.boolean(),
  tracksLoads: z.boolean(),
  previousRoutines: text(1000),
  favoriteExercises: z.array(exerciseId).max(30),
  dislikedExercises: z.array(exerciseId).max(30),
  strengthMarks: z.array(strengthMarkSchema).max(4),
  weakMuscles: z.array(z.enum(MUSCLES)).max(11),
  mobilityNotes: text(500),

  // Disponibilidad y equipamiento
  daysPerWeek: z.number().int().min(2, "Mínimo 2 días.").max(6, "Máximo 6 días."),
  trainingWeekdays: z.array(z.number().int().min(1).max(7)).max(7),
  sessionMinutes: z.number().int().min(30).max(150),
  equipment: z.array(z.enum(EQUIPMENT)).min(1, "Marca al menos un tipo de material."),

  // Hábitos
  sleepHours: z.number().min(3).max(12).nullable(),
  dailySteps: z.number().int().min(0).max(40000).nullable(),
  jobActivity: z.enum(JOB_ACTIVITY),
  stressLevel: z.enum(STRESS),

  // Alimentación
  mealsPerDay: z.number().int().min(2).max(7),
  appetite: z.enum(APPETITE),
  dietPreference: z.enum(DIETS),
  allergies: z.array(z.enum(ALLERGENS)).max(8),
  intoleranceNotes: text(300),
  favoriteFoods: text(500),
  excludedFoods: text(500),
  weeklyFoodBudget: z.number().min(0).max(2000).nullable(),
  supplements: text(300),
});
export type ProfileInput = z.infer<typeof profileSchema>;

/** Lo que envía el cuestionario inicial: perfil + peso + medidas + limitaciones. */
export const onboardingSchema = profileSchema.extend({
  weightKg: z.number("Indica tu peso.").min(30, "Revisa el peso.").max(300, "Revisa el peso."),
  measurements: measurementsSchema,
  limitations: z.array(limitationSchema).max(10),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;

/** Convierte el primer error de validación en un mensaje legible con el nombre del campo. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? issue.message : "Revisa los datos.";
}
