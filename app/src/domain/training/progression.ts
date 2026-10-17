import type { Exercise } from "../exercises";
import { estimateOneRepMax } from "./level";

/**
 * Progresión de cargas: doble progresión (primero repeticiones, después carga).
 * Cálculo determinista a partir de lo registrado; nunca sube la carga si hubo dolor o la recuperación es mala.
 */

export type LoggedSet = { weightKg: number; reps: number; rir: number | null };

export type PastPerformance = {
  date: string;
  sets: LoggedSet[];
  /** 0 sin molestias · 1 leve · 2 moderada · 3 dolor. */
  discomfort: number;
};

export type Target = { sets: number; repMin: number; repMax: number; rirMin: number; rirMax: number };

export type SuggestionKind = "calibrate" | "increase" | "add_reps" | "hold" | "reduce" | "pain";

export type Suggestion = {
  kind: SuggestionKind;
  /** Carga sugerida en kg (null = todavía no hay referencia). */
  weightKg: number | null;
  /** Repeticiones a buscar en cada serie. */
  repGoal: string;
  title: string;
  reason: string;
};

export function roundToStep(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.max(0, Math.round(value / step) * step);
}

/** La carga de trabajo de una sesión: la más repetida entre las series (la mayor en caso de empate). */
export function workingWeight(sets: LoggedSet[]): number {
  const counts = new Map<number, number>();
  for (const set of sets) counts.set(set.weightKg, (counts.get(set.weightKg) ?? 0) + 1);
  let best = 0;
  let bestCount = 0;
  for (const [weight, count] of counts) {
    if (count > bestCount || (count === bestCount && weight > best)) {
      best = weight;
      bestCount = count;
    }
  }
  return best;
}

/** Mejor 1RM estimado de una sesión. */
export function sessionBestE1rm(sets: LoggedSet[]): number {
  return sets.reduce((best, set) => Math.max(best, estimateOneRepMax(set.weightKg, Math.min(set.reps, 15))), 0);
}

export type RecoveryFlags = { poorRecovery: boolean };

export function suggestNext(
  exercise: Pick<Exercise, "loadStep" | "bodyweight" | "perSide">,
  target: Target,
  /** Sesiones anteriores de este ejercicio, de la más reciente a la más antigua. */
  history: PastPerformance[],
  recovery: RecoveryFlags = { poorRecovery: false },
): Suggestion {
  const range = `${target.repMin}-${target.repMax}`;
  const rirText = target.rirMin === target.rirMax ? `${target.rirMin}` : `${target.rirMin}-${target.rirMax}`;
  const last = history.find((entry) => entry.sets.length > 0);

  if (!last) {
    return {
      kind: "calibrate",
      weightKg: null,
      repGoal: range,
      title: "Primera vez: busca tu carga de referencia",
      reason: `Elige un peso con el que completes ${range} repeticiones dejando unas ${rirText} en reserva. Si dudas, empieza ligero: lo registrado hoy servirá de base para la próxima sesión.`,
    };
  }

  const weight = workingWeight(last.sets);
  const atWeight = last.sets.filter((set) => set.weightKg === weight);
  const reps = atWeight.map((set) => set.reps);
  const repsText = reps.join(", ");
  const rirs = atWeight.map((set) => set.rir).filter((rir): rir is number => rir !== null);
  const avgRir = rirs.length > 0 ? rirs.reduce((a, b) => a + b, 0) / rirs.length : null;
  const step = exercise.loadStep;
  const unit = exercise.perSide ? " por lado" : "";
  const lastText = exercise.bodyweight && weight === 0 ? `sin lastre × ${repsText}` : `${formatKg(weight)} kg${unit} × ${repsText}`;

  if (last.discomfort >= 2) {
    return {
      kind: "pain",
      weightKg: weight > 0 ? roundToStep(weight * 0.85, step) : weight,
      repGoal: range,
      title: "No subas la carga: hubo molestias",
      reason: `La última vez registraste ${last.discomfort === 3 ? "dolor" : "una molestia moderada"} en este ejercicio. Prueba una alternativa o reduce el peso y comprueba que el movimiento no duele. No entrenes a través del dolor; si se repite, consulta a un profesional sanitario.`,
    };
  }

  const minSets = Math.min(target.sets, 2);
  const enoughSets = atWeight.length >= minSets;
  // Con cargas ligeras el salto mínimo es proporcionalmente grande: se exigen más repeticiones antes de subir.
  const bigJump = weight > 0 && step / weight > 0.12;
  const repsToIncrease = target.repMax + (bigJump ? 2 : 0);
  const allAtTop = enoughSets && reps.every((r) => r >= repsToIncrease);
  const effortOk = avgRir === null || avgRir >= target.rirMin;
  const tooHeavy = (reps[0] ?? 0) < target.repMin || reps.filter((r) => r < target.repMin).length * 2 > reps.length;

  if (allAtTop && effortOk) {
    if (recovery.poorRecovery || last.discomfort === 1) {
      return {
        kind: "hold",
        weightKg: weight,
        repGoal: reps.join(", "),
        title: "Mantén la carga esta sesión",
        reason: `Última vez: ${lastText}. Ya estás en la parte alta del rango, pero ${
          last.discomfort === 1 ? "anotaste una molestia leve" : "tu última revisión indica mala recuperación (sueño o energía bajos)"
        }. Repite el mismo trabajo y sube cuando te encuentres bien.`,
      };
    }
    const next = exercise.bodyweight && weight === 0 ? step : roundToStep(weight + step, step);
    return {
      kind: "increase",
      weightKg: next,
      repGoal: `${target.repMin}-${Math.min(target.repMax, target.repMin + 2)}`,
      title: `Sube a ${formatKg(next)} kg${unit}`,
      reason: `Última vez: ${lastText}. Completaste todas las series en la parte alta del rango${
        avgRir !== null ? ` con unas ${formatKg(Math.round(avgRir * 2) / 2)} repeticiones en reserva` : ""
      }. Sube el salto mínimo y vuelve a trabajar desde la parte baja del rango.`,
    };
  }

  if (allAtTop && !effortOk) {
    return {
      kind: "hold",
      weightKg: weight,
      repGoal: reps.join(", "),
      title: "Mantén la carga y busca más margen",
      reason: `Última vez: ${lastText}. Llegaste a la parte alta del rango, pero al límite (menos repeticiones en reserva de las previstas). Repite la carga intentando terminar con unas ${rirText} en reserva; entonces tocará subir.`,
    };
  }

  if (tooHeavy && enoughSets) {
    const next = roundToStep(Math.max(0, weight - step), step);
    return {
      kind: "reduce",
      weightKg: next,
      repGoal: range,
      title: weight > 0 ? `Baja a ${formatKg(next)} kg${unit}` : "Busca más repeticiones",
      reason: `Última vez: ${lastText}. Quedaste por debajo de ${target.repMin} repeticiones, así que la carga es alta para el rango previsto. Con algo menos de peso harás más repeticiones de calidad.`,
    };
  }

  // Dentro del rango: misma carga y una repetición más donde aún hay margen.
  const goal = [...reps];
  const index = goal.findIndex((r) => r < repsToIncrease);
  if (index >= 0) goal[index] = (goal[index] ?? 0) + 1;
  while (goal.length < target.sets) goal.push(Math.max(target.repMin, (goal[goal.length - 1] ?? target.repMin) - 1));

  const easy = avgRir !== null && avgRir > target.rirMax + 1;
  return {
    kind: "add_reps",
    weightKg: weight,
    repGoal: goal.join(", "),
    title: `Misma carga, una repetición más`,
    reason: `Última vez: ${lastText}. ${
      easy
        ? `Anotaste más repeticiones en reserva de las previstas: acércate al objetivo de RIR ${rirText} antes de subir el peso.`
        : `Mantén el peso e intenta sumar una repetición. Cuando todas las series lleguen a ${repsToIncrease}, tocará subir carga.`
    }`,
  };
}

/** Sin progreso: mismo o menor rendimiento en las últimas `window` sesiones. */
export function isStalled(history: PastPerformance[], window = 3): boolean {
  const recent = history.filter((entry) => entry.sets.length > 0).slice(0, window);
  if (recent.length < window) return false;
  const scores = recent.map((entry) => sessionBestE1rm(entry.sets));
  const newest = scores[0] ?? 0;
  const oldest = scores[scores.length - 1] ?? 0;
  return oldest > 0 && newest <= oldest * 1.005;
}

export function formatKg(value: number): string {
  return (Math.round(value * 100) / 100).toLocaleString("es-ES", { maximumFractionDigits: 2 });
}
