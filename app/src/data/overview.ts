import type { Queryable } from "@/db/types";
import { nextDayPosition, recentWeeks, sessionsPerWeek, streakWeeks, type WeekAdherence } from "@/domain/training/adherence";
import type { RecoveryFlags } from "@/domain/training/progression";
import { addDays, today as todayDate, weekStart } from "@/lib/dates";
import { blockWeek, getActiveBlock, type Block, type PlanDay } from "./blocks";
import { getOpenSession, listCompletedSessions, type OpenSession, type SessionSummary } from "./sessions";

export type TrainingOverview = {
  today: string;
  block: Block | null;
  /** Semana del bloque en curso (1 = primera). */
  week: number;
  openSession: OpenSession | null;
  nextDay: PlanDay | null;
  /** Última fecha en que se completó cada día del plan. */
  lastDone: Record<string, string>;
  sessions: SessionSummary[];
  thisWeek: WeekAdherence;
  weeks: WeekAdherence[];
  streak: number;
  trainedToday: boolean;
};

export async function getTrainingOverview(db: Queryable, daysPerWeek: number): Promise<TrainingOverview> {
  const today = todayDate();
  const block = await getActiveBlock(db);
  const openSession = await getOpenSession(db);
  const sessions = await listCompletedSessions(db, { sinceDays: 200 });

  const lastDone: Record<string, string> = {};
  for (const session of sessions) {
    if (session.planDayId && !lastDone[session.planDayId]) lastDone[session.planDayId] = session.date;
  }

  let nextDay: PlanDay | null = null;
  if (block && block.days.length > 0) {
    const last = sessions.find((session) => session.blockId === block.id && block.days.some((day) => day.id === session.planDayId));
    const lastPosition = last ? (block.days.find((day) => day.id === last.planDayId)?.position ?? null) : null;
    nextDay = block.days[nextDayPosition(block.days.length, lastPosition)] ?? null;
  }

  const counts = sessionsPerWeek(sessions.map((session) => session.date));
  const since = sessions.length > 0 ? sessions[sessions.length - 1]!.date : (block?.startedOn ?? today);
  const weeks = recentWeeks(counts, daysPerWeek, today, 8, since);
  const current = weekStart(today);

  return {
    today,
    block,
    week: block ? blockWeek(block, today) : 1,
    openSession,
    nextDay,
    lastDone,
    sessions,
    thisWeek: weeks.find((week) => week.weekStart === current) ?? { weekStart: current, completed: 0, planned: daysPerWeek, ratio: 0 },
    weeks,
    streak: streakWeeks(counts, daysPerWeek, today),
    trainedToday: sessions.some((session) => session.date === today),
  };
}

/** Mala recuperación reciente: sueño o energía bajos en la última revisión semanal (últimos 10 días). */
export async function getRecoveryFlags(db: Queryable): Promise<RecoveryFlags> {
  const last = await db.get<{ sleep_quality: number; energy: number }>(
    "select sleep_quality, energy from weekly_checkins where week_start >= ? order by week_start desc limit 1",
    [addDays(todayDate(), -10)],
  );
  return { poorRecovery: Boolean(last && (last.sleep_quality <= 2 || last.energy <= 2)) };
}
