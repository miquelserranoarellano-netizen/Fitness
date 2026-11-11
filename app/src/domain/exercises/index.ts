import { t } from "@/i18n";
import { LEGS } from "./legs";
import { PULL } from "./pull";
import { PUSH } from "./push";
import type { Exercise } from "./types";

export type { Exercise, Pattern } from "./types";

/** Catálogo completo. El orden es estable y sirve de desempate al generar rutinas. */
export const EXERCISES: Exercise[] = [...PUSH, ...PULL, ...LEGS];

const BY_ID = new Map(EXERCISES.map((exercise) => [exercise.id, exercise]));

export function getExercise(id: string): Exercise | undefined {
  return BY_ID.get(id);
}

export function requireExercise(id: string): Exercise {
  const exercise = BY_ID.get(id);
  if (!exercise) throw new Error(`Ejercicio desconocido: ${id}`);
  return exercise;
}

/** Nombre del ejercicio en el idioma activo. */
export function exerciseName(id: string): string {
  return t(BY_ID.get(id)?.name ?? "Ejercicio retirado del catálogo");
}

export const EXERCISE_IDS = EXERCISES.map((exercise) => exercise.id);

/** Enlace de búsqueda de una demostración en vídeo (no es una fuente verificada, solo una búsqueda). */
export function videoSearchUrl(exercise: Exercise): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${exercise.name} técnica correcta`)}`;
}
