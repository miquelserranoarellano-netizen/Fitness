import { MEASURES, type Measure } from "../types";
import { change, type Change } from "./trend";

export type MeasurePoint = { date: string; value: number };

export type MeasureProgress = {
  measure: Measure;
  series: MeasurePoint[];
  first: MeasurePoint | null;
  previous: MeasurePoint | null;
  latest: MeasurePoint | null;
  /** Diferencia entre la última medición y la anterior. */
  vsPrevious: Change | null;
  /** Diferencia entre la última medición y la primera. */
  vsFirst: Change | null;
};

type Record_ = { date: string; values: Record<Measure, number | null> };

/** Evolución de cada perímetro a partir de las mediciones guardadas (en cualquier orden). */
export function measureProgress(records: Record_[]): Record<Measure, MeasureProgress> {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const out = {} as Record<Measure, MeasureProgress>;
  for (const measure of MEASURES) {
    const series: MeasurePoint[] = [];
    for (const record of sorted) {
      const value = record.values[measure];
      if (value !== null) series.push({ date: record.date, value });
    }
    const latest = series[series.length - 1] ?? null;
    const previous = series.length > 1 ? (series[series.length - 2] ?? null) : null;
    const first = series[0] ?? null;
    out[measure] = {
      measure,
      series,
      first,
      previous,
      latest,
      vsPrevious: change(previous?.value, latest?.value),
      vsFirst: series.length > 1 ? change(first?.value, latest?.value) : null,
    };
  }
  return out;
}
