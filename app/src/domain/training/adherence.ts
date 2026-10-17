import { addDays, weekStart } from "@/lib/dates";

/** Número de sesiones completadas por semana (clave: lunes de la semana). */
export function sessionsPerWeek(sessionDates: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const date of sessionDates) {
    const week = weekStart(date);
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  return counts;
}

/**
 * Semanas seguidas cumpliendo el objetivo de sesiones. La semana en curso suma si ya se ha cumplido,
 * pero no rompe la racha mientras siga abierta.
 */
export function streakWeeks(counts: Map<string, number>, target: number, today: string): number {
  const current = weekStart(today);
  let streak = (counts.get(current) ?? 0) >= target ? 1 : 0;
  for (let week = addDays(current, -7); (counts.get(week) ?? 0) >= target; week = addDays(week, -7)) streak += 1;
  return streak;
}

export type WeekAdherence = { weekStart: string; completed: number; planned: number; ratio: number };

/** Últimas `weeks` semanas (incluida la actual), de la más antigua a la más reciente. */
export function recentWeeks(counts: Map<string, number>, planned: number, today: string, weeks: number, since?: string): WeekAdherence[] {
  const current = weekStart(today);
  const first = since ? weekStart(since) : null;
  const out: WeekAdherence[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const week = addDays(current, -7 * i);
    if (first && week < first) continue;
    const completed = counts.get(week) ?? 0;
    out.push({ weekStart: week, completed, planned, ratio: planned > 0 ? Math.min(1, completed / planned) : 0 });
  }
  return out;
}

/** Siguiente día del plan en la rotación: el posterior al último completado (o el primero). */
export function nextDayPosition(dayCount: number, lastCompletedPosition: number | null): number {
  if (dayCount <= 0) return 0;
  if (lastCompletedPosition === null) return 0;
  return (lastCompletedPosition + 1) % dayCount;
}
