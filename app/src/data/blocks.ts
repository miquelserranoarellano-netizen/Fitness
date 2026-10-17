import { json, nowIso, parseJson, type Queryable } from "@/db/types";
import { generatePlan, type GeneratedPlan, type PlanInput, type RationaleItem, type SplitId, type VolumeRange } from "@/domain/training/plan";
import type { Level, Muscle } from "@/domain/types";
import { daysBetween } from "@/lib/dates";
import { newId } from "@/lib/id";
import type { Limitation, Profile } from "./profile";

/** Lo que se guarda junto al bloque: con qué datos y por qué se generó así. */
export type BlockRationale = {
  level: Level;
  levelReasons: string[];
  daysPerWeek: number;
  sessionMinutes: number;
  priorityMuscles: Muscle[];
  rationale: RationaleItem[];
  warnings: string[];
  objectives: string[];
  expectedProgression: string;
  volumeCriteria: GeneratedPlan["volumeCriteria"];
  weeklyVolume: Record<Muscle, number>;
  volumeTargets: Record<Muscle, VolumeRange>;
  /** Cambios respecto al bloque anterior, con el dato que los justifica. */
  changes?: { title: string; detail: string }[];
  /** Ajuste acumulado de series por músculo decidido en evaluaciones anteriores. */
  volumeAdjust?: Partial<Record<Muscle, number>>;
  /** Ejercicios retirados por molestias repetidas. */
  avoidExercises?: string[];
  /** La primera semana se hace con la mitad de series (descarga). */
  deload?: boolean;
};

/** Decisiones heredadas de la evaluación del bloque anterior. */
export type BlockCarryOver = Pick<BlockRationale, "changes" | "volumeAdjust" | "avoidExercises" | "deload">;

export function planInputFromProfile(profile: Profile, limitations: Limitation[], carry: BlockCarryOver = {}): PlanInput {
  return {
    volumeAdjust: carry.volumeAdjust,
    level: profile.level,
    goal: profile.primaryGoal,
    strengthFocus: profile.primaryGoal === "strength" || profile.secondaryGoals.includes("strength"),
    daysPerWeek: profile.daysPerWeek,
    sessionMinutes: profile.sessionMinutes,
    priorityMuscles: profile.priorityMuscles,
    equipment: profile.equipment,
    limitations: limitations.filter((l) => l.active).map((l) => ({ area: l.bodyArea, severity: l.severity })),
    disliked: [...new Set([...profile.dislikedExercises, ...(carry.avoidExercises ?? [])])],
    favorites: profile.favoriteExercises,
  };
}

/** Cierra el bloque activo (si lo hay) y guarda uno nuevo con su plan semanal. Dentro de una transacción. */
export async function createBlock(
  tx: Queryable,
  plan: GeneratedPlan,
  meta: { level: Level; levelReasons: string[]; daysPerWeek: number; sessionMinutes: number; startedOn: string; carry?: BlockCarryOver },
): Promise<string> {
  await tx.run("update training_blocks set status = 'completed', ended_on = ? where status = 'active'", [meta.startedOn]);
  const last = await tx.get<{ n: number }>("select coalesce(max(number), 0) as n from training_blocks");

  const rationale: BlockRationale = {
    level: meta.level,
    levelReasons: meta.levelReasons,
    daysPerWeek: meta.daysPerWeek,
    sessionMinutes: meta.sessionMinutes,
    priorityMuscles: plan.priorityMuscles,
    rationale: plan.rationale,
    warnings: plan.warnings,
    objectives: plan.objectives,
    expectedProgression: plan.expectedProgression,
    volumeCriteria: plan.volumeCriteria,
    weeklyVolume: plan.weeklyVolume,
    volumeTargets: plan.volumeTargets,
    ...meta.carry,
  };

  const blockId = newId();
  await tx.run(
    "insert into training_blocks (id, number, split, weeks_planned, started_on, rationale, created_at) values (?, ?, ?, ?, ?, ?, ?)",
    [blockId, Number(last?.n ?? 0) + 1, plan.split, plan.weeks, meta.startedOn, json(rationale), nowIso()],
  );

  for (const [position, day] of plan.days.entries()) {
    const dayId = newId();
    await tx.run("insert into plan_days (id, block_id, position, name, focus) values (?, ?, ?, ?, ?)", [dayId, blockId, position, day.name, day.focus]);
    for (const [index, exercise] of day.exercises.entries()) {
      await tx.run(
        `insert into plan_exercises (id, plan_day_id, position, exercise_id, sets, rep_min, rep_max, rir_min, rir_max, rest_seconds, note)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId(),
          dayId,
          index,
          exercise.exerciseId,
          exercise.sets,
          exercise.repMin,
          exercise.repMax,
          exercise.rirMin,
          exercise.rirMax,
          exercise.restSeconds,
          exercise.note,
        ],
      );
    }
  }
  return blockId;
}

/** Genera y guarda un bloque nuevo a partir del perfil actual. */
export async function createBlockFromProfile(
  tx: Queryable,
  profile: Profile,
  limitations: Limitation[],
  meta: { levelReasons: string[]; startedOn: string; carry?: BlockCarryOver },
): Promise<{ blockId: string; plan: GeneratedPlan }> {
  const plan = generatePlan(planInputFromProfile(profile, limitations, meta.carry));
  const blockId = await createBlock(tx, plan, {
    level: profile.level,
    levelReasons: meta.levelReasons,
    daysPerWeek: profile.daysPerWeek,
    sessionMinutes: profile.sessionMinutes,
    startedOn: meta.startedOn,
    carry: meta.carry,
  });
  return { blockId, plan };
}

export type BlockEvaluation = {
  sessionsCompleted: number;
  sessionsPlanned: number;
  adherencePct: number;
  summary: string[];
  closedOn: string;
};

export async function saveBlockEvaluation(tx: Queryable, blockId: string, evaluation: BlockEvaluation): Promise<void> {
  await tx.run("update training_blocks set evaluation = ? where id = ?", [json(evaluation), blockId]);
}

export type PlanExercise = {
  id: string;
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  rirMin: number;
  rirMax: number;
  restSeconds: number;
  note: string | null;
};

export type PlanDay = { id: string; position: number; name: string; focus: string; exercises: PlanExercise[] };

export type Block = {
  id: string;
  number: number;
  status: "active" | "completed";
  split: SplitId;
  weeksPlanned: number;
  startedOn: string;
  endedOn: string | null;
  rationale: BlockRationale;
  evaluation: BlockEvaluation | null;
  days: PlanDay[];
};

export type BlockSummary = Omit<Block, "days">;

type BlockRow = {
  id: string;
  number: number;
  status: "active" | "completed";
  split: SplitId;
  weeks_planned: number;
  started_on: string;
  ended_on: string | null;
  rationale: string;
  evaluation: string | null;
};

const BLOCK_COLUMNS = "id, number, status, split, weeks_planned, started_on, ended_on, rationale, evaluation";

async function loadDays(db: Queryable, blockId: string): Promise<PlanDay[]> {
  const rows = await db.all<{
    day_id: string;
    day_position: number;
    name: string;
    focus: string;
    id: string | null;
    exercise_id: string | null;
    sets: number;
    rep_min: number;
    rep_max: number;
    rir_min: number;
    rir_max: number;
    rest_seconds: number;
    note: string | null;
  }>(
    `select d.id as day_id, d.position as day_position, d.name, d.focus,
            e.id, e.exercise_id, e.sets, e.rep_min, e.rep_max, e.rir_min, e.rir_max, e.rest_seconds, e.note
       from plan_days d
       left join plan_exercises e on e.plan_day_id = d.id
      where d.block_id = ?
      order by d.position, e.position`,
    [blockId],
  );

  const days = new Map<string, PlanDay>();
  for (const row of rows) {
    let day = days.get(row.day_id);
    if (!day) {
      day = { id: row.day_id, position: row.day_position, name: row.name, focus: row.focus, exercises: [] };
      days.set(row.day_id, day);
    }
    if (row.id && row.exercise_id) {
      day.exercises.push({
        id: row.id,
        exerciseId: row.exercise_id,
        sets: row.sets,
        repMin: row.rep_min,
        repMax: row.rep_max,
        rirMin: row.rir_min,
        rirMax: row.rir_max,
        restSeconds: row.rest_seconds,
        note: row.note,
      });
    }
  }
  return [...days.values()];
}

function mapBlock(row: BlockRow, days: PlanDay[]): Block {
  return {
    id: row.id,
    number: Number(row.number),
    status: row.status,
    split: row.split,
    weeksPlanned: Number(row.weeks_planned),
    startedOn: row.started_on,
    endedOn: row.ended_on,
    rationale: parseJson<BlockRationale>(row.rationale, {} as BlockRationale),
    evaluation: parseJson<BlockEvaluation | null>(row.evaluation, null),
    days,
  };
}

export async function getActiveBlock(db: Queryable): Promise<Block | null> {
  const row = await db.get<BlockRow>(`select ${BLOCK_COLUMNS} from training_blocks where status = 'active'`);
  return row ? mapBlock(row, await loadDays(db, row.id)) : null;
}

export async function getBlockByNumber(db: Queryable, number: number): Promise<Block | null> {
  const row = await db.get<BlockRow>(`select ${BLOCK_COLUMNS} from training_blocks where number = ?`, [number]);
  return row ? mapBlock(row, await loadDays(db, row.id)) : null;
}

export async function listBlocks(db: Queryable): Promise<BlockSummary[]> {
  const rows = await db.all<BlockRow>(`select ${BLOCK_COLUMNS} from training_blocks order by number desc`);
  return rows.map((row) => {
    const { days: _days, ...summary } = mapBlock(row, []);
    void _days;
    return summary;
  });
}

/** Semana del bloque en la que cae una fecha (1 = primera). */
export function blockWeek(block: Pick<Block, "startedOn">, date: string): number {
  return Math.max(1, Math.floor(daysBetween(block.startedOn, date) / 7) + 1);
}
