import { labels } from "@/i18n";
import type { MeasureProgress } from "../body/measurements";
import { exerciseName } from "../exercises";
import type { VolumeRange } from "../training/plan";
import { MEASURE_LABEL, MUSCLES, MUSCLE_LABEL, type Measure, type Muscle } from "../types";
import { MIN_SESSIONS_FOR_TREND, type MuscleStats } from "./muscles";

/**
 * Análisis de puntos fuertes y débiles. Reglas explícitas sobre datos registrados:
 * nunca se concluye nada a partir de una fotografía ni de una medida aislada.
 */

export type FindingKind =
  /** Debilidad confirmada por datos de rendimiento. */
  | "confirmed"
  /** Posible área de mejora estética (percepción del usuario o medidas), sin evidencia de rendimiento. */
  | "aesthetic"
  /** Información insuficiente para concluir. */
  | "insufficient"
  /** Punto fuerte: progresión clara. */
  | "strength"
  /** Evoluciona con normalidad. */
  | "on_track";

export type Finding = {
  muscle: Muscle;
  kind: FindingKind;
  title: string;
  evidence: string[];
  causes: string[];
  proposal: string;
  successIndicator: string;
};

export const FINDING_LABEL: Record<FindingKind, string> = labels({
  confirmed: "Debilidad confirmada por rendimiento",
  aesthetic: "Posible área de mejora estética",
  insufficient: "Información insuficiente",
  strength: "Punto fuerte",
  on_track: "Evoluciona con normalidad",
});

/** Perímetro que mejor refleja el tamaño de cada grupo muscular (si lo hay). */
export const MUSCLE_MEASURE: Partial<Record<Muscle, Measure>> = {
  chest: "chest",
  shoulders: "shoulders",
  biceps: "arm_flexed",
  triceps: "arm_relaxed",
  forearms: "forearm",
  quads: "thigh",
  hamstrings: "thigh",
  glutes: "hips",
  calves: "calf",
};

export type WeakPointInput = {
  stats: Record<Muscle, MuscleStats>;
  targets: Record<Muscle, VolumeRange>;
  measures: Record<Measure, MeasureProgress>;
  /** Músculos que el usuario percibe como débiles o quiere priorizar. */
  declaredWeak: Muscle[];
  priority: Muscle[];
  /** Proporción de sesiones planificadas que se han completado en las últimas semanas (0-1); null sin datos. */
  adherence: number | null;
  /** Mala recuperación reciente según las revisiones semanales. */
  poorRecovery: boolean;
  /** Cómo escribir una longitud en las unidades del usuario (por defecto, centímetros). */
  formatLength?: (cm: number) => string;
};

const pct = (value: number) => `${value > 0 ? "+" : ""}${value.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;
const num = (value: number) => value.toLocaleString("es-ES", { maximumFractionDigits: 1 });

const STALL_THRESHOLD = 0.5;
const STRENGTH_THRESHOLD = 4;

export function analyzeWeakPoints(input: WeakPointInput): Finding[] {
  const { stats, targets } = input;
  const withTrend = MUSCLES.filter((muscle) => stats[muscle].progressPct !== null);
  const anyProgressing = withTrend.some((muscle) => (stats[muscle].progressPct ?? 0) > STALL_THRESHOLD * 2);

  return MUSCLES.map((muscle): Finding => {
    const stat = stats[muscle];
    const target = targets[muscle];
    const name = MUSCLE_LABEL[muscle].toLowerCase();
    const measureKey = MUSCLE_MEASURE[muscle];
    const measure = measureKey ? input.measures[measureKey] : null;
    const declared = input.declaredWeak.includes(muscle);
    const evidence: string[] = [];

    if (stat.sessions > 0) {
      evidence.push(`${stat.sessions} ${stat.sessions === 1 ? "sesión registrada" : "sesiones registradas"} con trabajo directo en las últimas 8 semanas.`);
      evidence.push(`Volumen medio: ${num(stat.weeklySets)} series semanales (rango recomendado: ${target.min}-${target.max}).`);
    }
    for (const exercise of stat.exercises.slice(0, 3)) {
      if (exercise.changePct !== null) {
        evidence.push(`${exerciseName(exercise.exerciseId)}: ${pct(exercise.changePct)} de rendimiento estimado en ${exercise.sessions} sesiones.`);
      }
    }
    if (measure && measureKey && measure.vsFirst && measure.first && measure.latest) {
      const length = input.formatLength ?? ((cm: number) => `${num(cm)} cm`);
      evidence.push(
        `${MEASURE_LABEL[measureKey]}: de ${length(measure.first.value)} a ${length(measure.latest.value)} (${pct(measure.vsFirst.percent)}) en ${measure.series.length} mediciones.`,
      );
    }
    if (stat.discomfortSessions > 0) {
      evidence.push(`Molestias moderadas o dolor anotados en ${stat.discomfortSessions} ${stat.discomfortSessions === 1 ? "sesión" : "sesiones"}.`);
    }

    const enoughPerformance = stat.progressPct !== null && stat.sessions >= MIN_SESSIONS_FOR_TREND;

    // 1. Sin datos de rendimiento suficientes.
    if (!enoughPerformance) {
      const aestheticSignal = declared || (measure !== null && measure.series.length >= 2 && (measure.vsFirst?.percent ?? 1) <= 0);
      if (aestheticSignal) {
        return {
          muscle,
          kind: "aesthetic",
          title: `${MUSCLE_LABEL[muscle]}: posible área de mejora, pendiente de confirmar`,
          evidence: [
            ...(declared ? ["Lo señalaste como un grupo que notas débil o atrasado."] : []),
            ...evidence,
            "Todavía no hay sesiones suficientes para saber si además progresa despacio.",
          ],
          causes: ["Con los datos actuales no se puede atribuir a una causa concreta."],
          proposal: `Registra todas las series de los ejercicios de ${name} durante al menos 3 semanas y repite las medidas a final de mes. Con eso se podrá confirmar o descartar.`,
          successIndicator: "Tener al menos 3 sesiones registradas y dos mediciones separadas un mes.",
        };
      }
      return {
        muscle,
        kind: "insufficient",
        title: `${MUSCLE_LABEL[muscle]}: información insuficiente`,
        evidence: evidence.length > 0 ? evidence : ["Aún no hay sesiones registradas con trabajo directo de este grupo."],
        causes: [],
        proposal: `Hacen falta al menos ${MIN_SESSIONS_FOR_TREND} sesiones registradas a lo largo de dos semanas o más para valorar su progresión.`,
        successIndicator: `${MIN_SESSIONS_FOR_TREND} sesiones registradas con sus series completas.`,
      };
    }

    const progress = stat.progressPct ?? 0;
    const belowVolume = stat.weeklySets < target.min;

    // 2. Estancado o en retroceso con datos suficientes.
    if (progress <= STALL_THRESHOLD) {
      const lowAdherence = input.adherence !== null && input.adherence < 0.7;
      // Si nada progresa, el problema es general (adherencia, recuperación o alimentación), no de este músculo.
      if (!anyProgressing || lowAdherence) {
        return {
          muscle,
          kind: "on_track",
          title: `${MUSCLE_LABEL[muscle]}: sin progreso, pero no es específico de este grupo`,
          evidence,
          causes: lowAdherence
            ? ["Has completado menos del 70 % de las sesiones previstas: no hay estímulo suficiente para valorar el plan."]
            : ["Ningún grupo muscular está progresando, lo que apunta a una causa general: recuperación, alimentación o constancia."],
          proposal: lowAdherence
            ? "Antes de cambiar nada, recupera la regularidad. Si los días previstos no encajan con tu semana, reduce el número de días en el perfil."
            : "Revisa primero el sueño, las calorías y la tendencia del peso en la revisión semanal antes de tocar la rutina.",
          successIndicator: "Completar las sesiones previstas durante 3 semanas seguidas.",
        };
      }

      const causes: string[] = [];
      if (belowVolume) causes.push(`Volumen por debajo del mínimo recomendado (${num(stat.weeklySets)} frente a ${target.min} series semanales).`);
      if (stat.discomfortSessions > 0) causes.push("Las molestias anotadas pueden estar limitando la intensidad.");
      if (input.poorRecovery) causes.push("Tu última revisión indica mala recuperación (sueño o energía bajos).");
      if (stat.exercises.some((exercise) => exercise.stalled)) causes.push("Llevas varias sesiones repitiendo carga y repeticiones en algún ejercicio.");
      if (causes.length === 0) causes.push("Técnica o cercanía al fallo insuficiente.", "Selección de ejercicios poco adecuada para ti.", "Volumen que ya no supone un estímulo.");

      return {
        muscle,
        kind: "confirmed",
        title: `${MUSCLE_LABEL[muscle]}: progresión detenida`,
        evidence: [...evidence, "Otros grupos musculares sí están progresando en el mismo periodo."],
        causes,
        proposal: stat.discomfortSessions > 0
          ? `Primero, resolver las molestias: usa las alternativas que no duelan y consulta a un profesional si persisten. Después se valorará el volumen de ${name}.`
          : belowVolume
            ? `Subir 1-2 series semanales de ${name} en el siguiente bloque y comprobar que se hacen cerca del RIR indicado.`
            : `Revisar la técnica y el RIR real en los ejercicios de ${name}; si en el siguiente bloque sigue igual, cambiar un ejercicio por una alternativa y añadir 1-2 series.`,
        successIndicator: `Sumar repeticiones o carga en los ejercicios de ${name} durante 3 semanas${measureKey ? ` y que ${MEASURE_LABEL[measureKey].toLowerCase()} no baje en la próxima medición` : ""}.`,
      };
    }

    // 3. Progresión clara.
    if (progress >= STRENGTH_THRESHOLD) {
      return {
        muscle,
        kind: "strength",
        title: `${MUSCLE_LABEL[muscle]}: progresión clara`,
        evidence,
        causes: [],
        proposal: "Mantén lo que estás haciendo: no hay motivo para cambiar ejercicios ni volumen.",
        successIndicator: "Seguir sumando repeticiones o carga con la misma técnica.",
      };
    }

    // 4. Progresa, aunque el usuario lo perciba débil.
    if (declared) {
      return {
        muscle,
        kind: "aesthetic",
        title: `${MUSCLE_LABEL[muscle]}: lo notas atrasado, pero el rendimiento progresa`,
        evidence: ["Lo señalaste como un grupo que notas débil o atrasado.", ...evidence],
        causes: ["El tamaño tarda más en verse que la fuerza: es normal que el rendimiento mejore antes que las medidas."],
        proposal: input.priority.includes(muscle)
          ? "Ya es un grupo prioritario en tu rutina. Mantén el plan y compara las medidas mes a mes."
          : `Si quieres darle más peso, márcalo como prioritario en el perfil: recibirá más series en el siguiente bloque.`,
        successIndicator: measureKey ? `Aumento de ${MEASURE_LABEL[measureKey].toLowerCase()} en las próximas dos mediciones mensuales.` : "Progresión mantenida durante el siguiente bloque.",
      };
    }

    return {
      muscle,
      kind: "on_track",
      title: `${MUSCLE_LABEL[muscle]}: evoluciona con normalidad`,
      evidence,
      causes: [],
      proposal: "Sin cambios.",
      successIndicator: "Progresión mantenida.",
    };
  });
}

const ORDER: FindingKind[] = ["confirmed", "aesthetic", "strength", "on_track", "insufficient"];

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}
