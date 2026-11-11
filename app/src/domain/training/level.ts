import { labels } from "@/i18n";
import type { Experience, Level, Sex } from "../types";

/** Levantamientos de referencia que se pueden indicar en el cuestionario inicial. */
export const MARK_LIFTS = ["bench", "squat", "deadlift", "overhead_press"] as const;
export type MarkLift = (typeof MARK_LIFTS)[number];
export const MARK_LIFT_LABEL: Record<MarkLift, string> = labels({
  bench: "Press de banca",
  squat: "Sentadilla",
  deadlift: "Peso muerto",
  overhead_press: "Press militar",
});

export type StrengthMark = { lift: MarkLift; weightKg: number; reps: number };

/** Estimación de 1RM (Epley). Solo es orientativa y pierde precisión por encima de ~12 repeticiones. */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

// Fuerza relativa (1RM estimado / peso corporal) a partir de la cual alguien ya no es principiante.
const INTERMEDIATE_RATIO: Record<MarkLift, { male: number; female: number }> = {
  bench: { male: 1.0, female: 0.6 },
  squat: { male: 1.4, female: 1.0 },
  deadlift: { male: 1.75, female: 1.25 },
  overhead_press: { male: 0.65, female: 0.4 },
};

export type LevelInput = {
  experience: Experience;
  structuredProgram: boolean;
  tracksLoads: boolean;
  marks: StrengthMark[];
  bodyWeightKg: number;
  sex: Sex;
};

export type LevelResult = { level: Level; reasons: string[] };

/**
 * Determina el nivel de entrenamiento con reglas explícitas. El tiempo entrenando solo cuenta de verdad
 * si ha habido un programa con progresión; las marcas de fuerza pueden subir el nivel, nunca bajarlo.
 */
export function determineLevel(input: LevelInput): LevelResult {
  const reasons: string[] = [];
  let level: Level;

  switch (input.experience) {
    case "none":
    case "lt6m":
      level = "beginner";
      reasons.push("Llevas menos de 6 meses entrenando con constancia: en esta etapa se progresa casi cada semana.");
      break;
    case "6to12m":
      if (input.structuredProgram && input.tracksLoads) {
        level = "intermediate";
        reasons.push("Llevas entre 6 y 12 meses con un programa estructurado y registrando tus cargas.");
      } else {
        level = "beginner";
        reasons.push(
          "Llevas entre 6 y 12 meses, pero sin un programa con progresión registrada: todavía puedes progresar como principiante.",
        );
      }
      break;
    case "1to2y":
      if (input.structuredProgram) {
        level = "intermediate";
        reasons.push("Llevas entre 1 y 2 años siguiendo un programa estructurado.");
      } else {
        level = "beginner";
        reasons.push(
          "Llevas entre 1 y 2 años, pero sin un programa con progresión: empezamos con un enfoque de principiante y lo revisamos según tus registros.",
        );
      }
      break;
    case "2to4y":
      level = "intermediate";
      reasons.push("Llevas entre 2 y 4 años entrenando.");
      break;
    case "gt4y":
      if (input.structuredProgram && input.tracksLoads) {
        level = "advanced";
        reasons.push("Llevas más de 4 años con programas estructurados y registro de cargas.");
      } else {
        level = "intermediate";
        reasons.push("Llevas más de 4 años, aunque sin registro sistemático de cargas: partimos de un nivel intermedio.");
      }
      break;
  }

  if (level === "beginner" && input.bodyWeightKg > 0) {
    const key = input.sex === "female" ? "female" : "male";
    const strong = input.marks.filter((mark) => {
      const ratio = estimateOneRepMax(mark.weightKg, mark.reps) / input.bodyWeightKg;
      return ratio >= INTERMEDIATE_RATIO[mark.lift][key];
    });
    if (strong.length >= 2) {
      level = "intermediate";
      reasons.push(
        `Tus marcas en ${strong.map((mark) => MARK_LIFT_LABEL[mark.lift].toLowerCase()).join(" y ")} corresponden a un nivel intermedio.`,
      );
    }
  }

  return { level, reasons };
}
