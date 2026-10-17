import { addDays, daysBetween, weekStart } from "@/lib/dates";

/**
 * Tendencia de peso. Evita decidir por una pesada aislada: una sola medición puede variar más de 1 kg
 * por líquidos, sal o contenido intestinal.
 */

export type WeightEntry = { date: string; kg: number };

export type WeightTrend =
  | { status: "insufficient"; entries: number; needed: string }
  | {
      status: "ok";
      entries: number;
      spanDays: number;
      /** Pendiente de la recta de regresión, en kg por semana. */
      kgPerWeek: number;
      /** La misma pendiente como porcentaje del peso medio del periodo. */
      pctPerWeek: number;
      /** Peso estimado hoy según la recta (más estable que la última pesada). */
      current: number;
    };

const MIN_ENTRIES = 3;
const MIN_SPAN_DAYS = 14;
const WINDOW_DAYS = 35;

export function weightTrend(entries: WeightEntry[], today: string): WeightTrend {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const from = addDays(today, -WINDOW_DAYS);
  let window = sorted.filter((entry) => entry.date >= from && entry.date <= today);
  // Si en la ventana reciente hay pocos datos, se usa todo lo que haya de los últimos 2 meses.
  if (window.length < MIN_ENTRIES) window = sorted.filter((entry) => entry.date >= addDays(today, -63) && entry.date <= today);

  const first = window[0];
  const last = window[window.length - 1];
  const span = first && last ? daysBetween(first.date, last.date) : 0;
  if (!first || !last || window.length < MIN_ENTRIES || span < MIN_SPAN_DAYS) {
    return {
      status: "insufficient",
      entries: window.length,
      needed: `Hacen falta al menos ${MIN_ENTRIES} pesajes repartidos en ${MIN_SPAN_DAYS} días o más para calcular una tendencia fiable.`,
    };
  }

  // Regresión lineal por mínimos cuadrados (x = días desde la primera pesada).
  const xs = window.map((entry) => daysBetween(first.date, entry.date));
  const ys = window.map((entry) => entry.kg);
  const n = window.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += ((xs[i] ?? 0) - meanX) * ((ys[i] ?? 0) - meanY);
    den += ((xs[i] ?? 0) - meanX) ** 2;
  }
  const slopePerDay = den === 0 ? 0 : num / den;
  const intercept = meanY - slopePerDay * meanX;
  const kgPerWeek = slopePerDay * 7;

  return {
    status: "ok",
    entries: n,
    spanDays: span,
    kgPerWeek,
    pctPerWeek: meanY === 0 ? 0 : (kgPerWeek / meanY) * 100,
    current: intercept + slopePerDay * daysBetween(first.date, last.date),
  };
}

export type WeeklyWeight = { weekStart: string; kg: number; entries: number };

/** Media de las pesadas de cada semana (lunes a domingo). */
export function weeklyAverages(entries: WeightEntry[]): WeeklyWeight[] {
  const groups = new Map<string, number[]>();
  for (const entry of entries) {
    const key = weekStart(entry.date);
    groups.set(key, [...(groups.get(key) ?? []), entry.kg]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, values]) => ({
      weekStart: week,
      kg: values.reduce((a, b) => a + b, 0) / values.length,
      entries: values.length,
    }));
}

/** Media móvil exponencial para suavizar la curva del gráfico. */
export function smooth(entries: WeightEntry[], alpha = 0.35): WeightEntry[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  let previous: number | null = null;
  return sorted.map((entry) => {
    previous = previous === null ? entry.kg : previous + alpha * (entry.kg - previous);
    return { date: entry.date, kg: previous };
  });
}

export type Change = { absolute: number; percent: number };

export function change(from: number | null | undefined, to: number | null | undefined): Change | null {
  if (from == null || to == null || from === 0) return null;
  return { absolute: to - from, percent: ((to - from) / from) * 100 };
}
