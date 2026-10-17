import { FINDING_LABEL, type Finding, type FindingKind } from "../analysis/weakpoints";
import type { MeasureProgress } from "../body/measurements";
import { change, type Change, type WeightEntry } from "../body/trend";
import type { CalorieDecision } from "../nutrition/targets";
import { MEASURES, MEASURE_LABEL, MUSCLE_LABEL, type Measure, type Muscle } from "../types";

/**
 * Informe mensual: qué mejora, qué está estancado y qué conviene cambiar, con los datos del periodo.
 */

export type MonthlyMeasure = { measure: Measure; fromCm: number; toCm: number; change: Change };

export type MonthlyReport = {
  periodStart: string;
  periodEnd: string;
  weight: { startKg: number | null; endKg: number | null; change: Change | null };
  measures: MonthlyMeasure[];
  adherence: { completed: number; planned: number; pct: number };
  improving: string[];
  stalled: string[];
  changes: string[];
  findings: { muscle: Muscle; kind: FindingKind; label: string; title: string }[];
  missing: string[];
};

export type MonthlyInput = {
  periodStart: string;
  periodEnd: string;
  weights: WeightEntry[];
  measures: Record<Measure, MeasureProgress>;
  sessionsCompleted: number;
  sessionsPlanned: number;
  findings: Finding[];
  calorieDecision: CalorieDecision;
  formatLength: (cm: number) => string;
  formatWeight: (kg: number) => string;
};

const signed = (value: number, digits = 1) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toLocaleString("es-ES", { maximumFractionDigits: digits })}`;

export function buildMonthlyReport(input: MonthlyInput): MonthlyReport {
  const inPeriod = input.weights.filter((entry) => entry.date >= input.periodStart && entry.date <= input.periodEnd);
  const before = input.weights.filter((entry) => entry.date < input.periodStart);
  const start = inPeriod[0] ?? before[before.length - 1] ?? null;
  const end = inPeriod[inPeriod.length - 1] ?? null;
  const weightChange = start && end && start.date !== end.date ? change(start.kg, end.kg) : null;

  // Medidas: la última del periodo frente a la anterior a ella.
  const measures: MonthlyMeasure[] = [];
  for (const measure of MEASURES) {
    const item = input.measures[measure];
    if (!item.latest || !item.previous || !item.vsPrevious) continue;
    if (item.latest.date < input.periodStart || item.latest.date > input.periodEnd) continue;
    measures.push({ measure, fromCm: item.previous.value, toCm: item.latest.value, change: item.vsPrevious });
  }

  const pct = input.sessionsPlanned > 0 ? Math.round((input.sessionsCompleted / input.sessionsPlanned) * 100) : 0;
  const improving: string[] = [];
  const stalled: string[] = [];
  const changes: string[] = [];
  const missing: string[] = [];

  for (const item of measures) {
    const text = `${MEASURE_LABEL[item.measure]}: de ${input.formatLength(item.fromCm)} a ${input.formatLength(item.toCm)} (${signed(item.change.percent)} %)`;
    // La cintura no es un objetivo de crecimiento: se valora aparte.
    if (item.measure === "waist") continue;
    if (item.change.percent >= 0.5) improving.push(text);
    else stalled.push(text);
  }
  for (const finding of input.findings) {
    if (finding.kind === "strength") improving.push(`${MUSCLE_LABEL[finding.muscle]}: progresión clara de rendimiento.`);
    if (finding.kind === "confirmed") {
      stalled.push(`${MUSCLE_LABEL[finding.muscle]}: progresión de rendimiento detenida.`);
      changes.push(`${MUSCLE_LABEL[finding.muscle]}: ${finding.proposal}`);
    }
  }

  const waist = measures.find((item) => item.measure === "waist");
  if (waist && weightChange && weightChange.percent > 0 && waist.change.percent > weightChange.percent * 1.5 && waist.change.percent > 1.5) {
    stalled.push(`Cintura: ${signed(waist.change.percent)} % frente a ${signed(weightChange.percent)} % de peso. Crece proporcionalmente más de lo deseable.`);
  }

  if (pct < 70) changes.push(`Cumplimiento del ${pct} %: antes de modificar el plan, ajusta los días por semana a los que puedes mantener.`);
  if (input.calorieDecision.action === "increase" || input.calorieDecision.action === "decrease") {
    changes.push(`${input.calorieDecision.title}. ${input.calorieDecision.reason}`);
  }
  if (changes.length === 0) changes.push("No hay cambios justificados: mantén el plan y sigue registrando.");

  if (!weightChange) missing.push("Peso: hacen falta al menos dos pesadas en fechas distintas dentro del periodo.");
  if (measures.length === 0) missing.push("Medidas: hace falta una medición en este periodo y otra anterior para compararlas.");
  const insufficient = input.findings.filter((finding) => finding.kind === "insufficient").length;
  if (insufficient > 0) missing.push(`Rendimiento: ${insufficient} grupos musculares aún no tienen sesiones suficientes para valorarlos.`);

  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    weight: { startKg: start?.kg ?? null, endKg: end?.kg ?? null, change: weightChange },
    measures,
    adherence: { completed: input.sessionsCompleted, planned: input.sessionsPlanned, pct },
    improving,
    stalled,
    changes,
    findings: input.findings
      .filter((finding) => finding.kind !== "insufficient" && finding.kind !== "on_track")
      .map((finding) => ({ muscle: finding.muscle, kind: finding.kind, label: FINDING_LABEL[finding.kind], title: finding.title })),
    missing,
  };
}
