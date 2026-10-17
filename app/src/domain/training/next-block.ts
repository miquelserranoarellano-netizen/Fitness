import type { Finding } from "../analysis/weakpoints";
import type { MuscleStats } from "../analysis/muscles";
import { exerciseName } from "../exercises";
import { MUSCLES, MUSCLE_LABEL, type Muscle } from "../types";

/**
 * Decide qué cambia en el siguiente bloque a partir de los resultados del actual.
 * Regla de oro: lo que funciona no se toca. Cada cambio lleva el dato que lo justifica.
 */

export type BlockChange = { title: string; detail: string };

export type NextBlockDecision = {
  /** Ajuste acumulado de series semanales por músculo para el generador. */
  volumeAdjust: Partial<Record<Muscle, number>>;
  /** Ejercicios que se sustituyen por molestias repetidas. */
  avoidExercises: string[];
  /** La primera semana del bloque se hace con la mitad de series. */
  deload: boolean;
  changes: BlockChange[];
};

export type NextBlockInput = {
  findings: Finding[];
  stats: Record<Muscle, MuscleStats>;
  priority: Muscle[];
  previousAdjust: Partial<Record<Muscle, number>>;
  /** Proporción de sesiones completadas en el bloque (0-1). */
  adherence: number;
  /** Revisiones semanales del bloque, de la más reciente a la más antigua. */
  checkins: { energy: number; sleepQuality: number; performance: number; pain: boolean }[];
};

const MAX_ADJUST = 6;
const MIN_ADJUST = -4;

export function decideNextBlock(input: NextBlockInput): NextBlockDecision {
  const volumeAdjust: Partial<Record<Muscle, number>> = { ...input.previousAdjust };
  const changes: BlockChange[] = [];
  const avoidExercises: string[] = [];

  // Fatiga acumulada: al menos dos de las tres últimas revisiones con sueño, energía o rendimiento bajos.
  const recent = input.checkins.slice(0, 3);
  const tiredWeeks = recent.filter((checkin) => checkin.energy <= 2 || checkin.sleepQuality <= 2 || checkin.performance <= 2).length;
  const deload = recent.length >= 2 && tiredWeeks >= 2;
  if (deload) {
    changes.push({
      title: "Semana de descarga al empezar",
      detail: `En ${tiredWeeks} de tus ${recent.length} últimas revisiones indicaste sueño, energía o rendimiento bajos. La primera semana del bloque se hace con la mitad de series para disipar la fatiga; no se sube volumen en este bloque.`,
    });
  }

  const lowAdherence = input.adherence < 0.7;
  if (lowAdherence) {
    changes.push({
      title: "Sin cambios de volumen",
      detail: `Has completado el ${Math.round(input.adherence * 100)} % de las sesiones previstas. Con ese cumplimiento no se puede saber si el volumen actual es suficiente, así que se mantiene.`,
    });
  }

  for (const muscle of MUSCLES) {
    const stat = input.stats[muscle];
    const finding = input.findings.find((item) => item.muscle === muscle);
    const name = MUSCLE_LABEL[muscle].toLowerCase();
    const current = volumeAdjust[muscle] ?? 0;

    // Molestias repetidas: se retira el ejercicio y no se sube el volumen de ese grupo.
    const painful = stat.exercises.filter((exercise) => exercise.recentDiscomfort >= 2);
    for (const exercise of painful) {
      avoidExercises.push(exercise.exerciseId);
      changes.push({
        title: `Se sustituye ${exerciseName(exercise.exerciseId).toLowerCase()}`,
        detail: `Anotaste molestias moderadas o dolor en sus últimas sesiones. Se cambia por una alternativa equivalente. Si la molestia aparece también con la alternativa, consulta a un profesional sanitario.`,
      });
    }
    if (painful.length > 0) continue;

    if (finding?.kind === "confirmed" && !deload && !lowAdherence) {
      const step = input.priority.includes(muscle) ? 2 : 1;
      const next = Math.min(MAX_ADJUST, current + step);
      if (next !== current) {
        volumeAdjust[muscle] = next;
        changes.push({
          title: `+${next - current} ${next - current === 1 ? "serie semanal" : "series semanales"} de ${name}`,
          detail: `Su progresión se ha detenido mientras otros grupos avanzan (${stat.progressPct === null ? "sin cambio medible" : `${stat.progressPct.toLocaleString("es-ES", { maximumFractionDigits: 1 })} % en el bloque`}), con una media de ${stat.weeklySets.toLocaleString("es-ES")} series semanales.`,
        });
      }
    }
  }

  // Si hubo que descargar, se retira parte del volumen añadido en bloques anteriores.
  if (deload) {
    for (const muscle of MUSCLES) {
      const current = volumeAdjust[muscle] ?? 0;
      if (current > 0) volumeAdjust[muscle] = Math.max(MIN_ADJUST, current - 1);
    }
  }

  if (changes.length === 0) {
    changes.push({
      title: "Se mantiene la estructura del bloque anterior",
      detail: "No hay ningún grupo estancado, ni molestias repetidas, ni señales de fatiga acumulada: los ejercicios y el volumen que están funcionando no se tocan. El objetivo es seguir progresando en cargas y repeticiones.",
    });
  }

  for (const muscle of MUSCLES) if (volumeAdjust[muscle] === 0) delete volumeAdjust[muscle];
  return { volumeAdjust, avoidExercises: [...new Set(avoidExercises)], deload, changes };
}
