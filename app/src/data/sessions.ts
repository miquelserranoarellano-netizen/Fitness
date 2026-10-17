import { nowIso, parseJson, type Db, type Queryable } from "@/db/types";
import { getExercise } from "@/domain/exercises";
import type { PastPerformance } from "@/domain/training/progression";
import { addDays, dateOf, today } from "@/lib/dates";
import { newId } from "@/lib/id";

/** Registro de entrenamientos reales: sesiones, ejercicios de la sesión y series. */

export type SessionSet = {
  id: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  rir: number | null;
  restSeconds: number | null;
  completedAt: string;
};

export type SessionExercise = {
  id: string;
  position: number;
  exerciseId: string;
  plannedExerciseId: string | null;
  targetSets: number;
  repMin: number;
  repMax: number;
  rirMin: number;
  rirMax: number;
  restSeconds: number;
  discomfort: number;
  note: string | null;
  sets: SessionSet[];
};

export type WorkoutSession = {
  id: string;
  name: string;
  status: "in_progress" | "completed";
  startedAt: string;
  finishedAt: string | null;
  planDayId: string | null;
  blockId: string | null;
  energy: number | null;
  notes: string | null;
  exercises: SessionExercise[];
};

export type OpenSession = { id: string; name: string; startedAt: string; planDayId: string | null };

export async function getOpenSession(db: Queryable): Promise<OpenSession | null> {
  const row = await db.get<{ id: string; name: string; started_at: string; plan_day_id: string | null }>(
    "select id, name, started_at, plan_day_id from workout_sessions where status = 'in_progress'",
  );
  return row ? { id: row.id, name: row.name, startedAt: row.started_at, planDayId: row.plan_day_id } : null;
}

/**
 * Empieza la sesión de un día del plan copiando sus objetivos. Si ya hay una sesión abierta, la
 * devuelve: solo puede haber una en curso. En la semana de descarga se hace la mitad de series.
 */
export async function startSession(db: Db, planDayId: string): Promise<string> {
  return db.transaction(async (tx) => {
    const open = await tx.get<{ id: string }>("select id from workout_sessions where status = 'in_progress'");
    if (open) return open.id;

    const day = await tx.get<{ id: string; name: string; block_id: string; rationale: string; started_on: string }>(
      `select d.id, d.name, d.block_id, b.rationale, b.started_on
         from plan_days d join training_blocks b on b.id = d.block_id
        where d.id = ? and b.status = 'active'`,
      [planDayId],
    );
    if (!day) throw new Error("Ese día no pertenece a tu plan actual.");
    const deloadWeek = Boolean(parseJson<{ deload?: boolean }>(day.rationale, {}).deload) && today() < addDays(day.started_on, 7);

    const sessionId = newId();
    await tx.run("insert into workout_sessions (id, block_id, plan_day_id, name, started_at) values (?, ?, ?, ?, ?)", [
      sessionId,
      day.block_id,
      day.id,
      deloadWeek ? `${day.name} · descarga` : day.name,
      nowIso(),
    ]);

    const planned = await tx.all<{
      position: number;
      exercise_id: string;
      sets: number;
      rep_min: number;
      rep_max: number;
      rir_min: number;
      rir_max: number;
      rest_seconds: number;
    }>("select position, exercise_id, sets, rep_min, rep_max, rir_min, rir_max, rest_seconds from plan_exercises where plan_day_id = ? order by position", [
      day.id,
    ]);
    for (const exercise of planned) {
      await tx.run(
        `insert into session_exercises (id, session_id, position, exercise_id, target_sets, rep_min, rep_max, rir_min, rir_max, rest_seconds)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId(),
          sessionId,
          exercise.position,
          exercise.exercise_id,
          deloadWeek ? Math.max(1, Math.floor((exercise.sets + 1) / 2)) : exercise.sets,
          exercise.rep_min,
          exercise.rep_max,
          exercise.rir_min,
          exercise.rir_max,
          exercise.rest_seconds,
        ],
      );
    }
    return sessionId;
  });
}

export async function getSession(db: Queryable, sessionId: string): Promise<WorkoutSession | null> {
  const session = await db.get<{
    id: string;
    name: string;
    status: "in_progress" | "completed";
    started_at: string;
    finished_at: string | null;
    plan_day_id: string | null;
    block_id: string | null;
    energy: number | null;
    notes: string | null;
  }>("select id, name, status, started_at, finished_at, plan_day_id, block_id, energy, notes from workout_sessions where id = ?", [sessionId]);
  if (!session) return null;

  const rows = await db.all<{
    id: string;
    position: number;
    exercise_id: string;
    planned_exercise_id: string | null;
    target_sets: number;
    rep_min: number;
    rep_max: number;
    rir_min: number;
    rir_max: number;
    rest_seconds: number;
    discomfort: number;
    note: string | null;
    set_id: string | null;
    set_number: number | null;
    weight_kg: number | null;
    reps: number | null;
    rir: number | null;
    set_rest: number | null;
    completed_at: string | null;
  }>(
    `select se.id, se.position, se.exercise_id, se.planned_exercise_id, se.target_sets, se.rep_min, se.rep_max,
            se.rir_min, se.rir_max, se.rest_seconds, se.discomfort, se.note,
            ws.id as set_id, ws.set_number, ws.weight_kg, ws.reps, ws.rir, ws.rest_seconds as set_rest, ws.completed_at
       from session_exercises se
       left join workout_sets ws on ws.session_exercise_id = se.id
      where se.session_id = ?
      order by se.position, ws.set_number`,
    [sessionId],
  );

  const exercises = new Map<string, SessionExercise>();
  for (const row of rows) {
    let exercise = exercises.get(row.id);
    if (!exercise) {
      exercise = {
        id: row.id,
        position: row.position,
        exerciseId: row.exercise_id,
        plannedExerciseId: row.planned_exercise_id,
        targetSets: row.target_sets,
        repMin: row.rep_min,
        repMax: row.rep_max,
        rirMin: row.rir_min,
        rirMax: row.rir_max,
        restSeconds: row.rest_seconds,
        discomfort: row.discomfort,
        note: row.note,
        sets: [],
      };
      exercises.set(row.id, exercise);
    }
    if (row.set_id && row.set_number !== null) {
      exercise.sets.push({
        id: row.set_id,
        setNumber: row.set_number,
        weightKg: Number(row.weight_kg),
        reps: Number(row.reps),
        rir: row.rir === null ? null : Number(row.rir),
        restSeconds: row.set_rest,
        completedAt: row.completed_at ?? session.started_at,
      });
    }
  }

  return {
    id: session.id,
    name: session.name,
    status: session.status,
    startedAt: session.started_at,
    finishedAt: session.finished_at,
    planDayId: session.plan_day_id,
    blockId: session.block_id,
    energy: session.energy,
    notes: session.notes,
    exercises: [...exercises.values()],
  };
}

export type SetInput = {
  sessionExerciseId: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  rir: number | null;
  restSeconds: number | null;
};

async function isOpenExercise(db: Queryable, sessionExerciseId: string): Promise<boolean> {
  const row = await db.get<{ ok: number }>(
    `select count(*) as ok from session_exercises se join workout_sessions s on s.id = se.session_id
      where se.id = ? and s.status = 'in_progress'`,
    [sessionExerciseId],
  );
  return (row?.ok ?? 0) > 0;
}

/** Guarda (o corrige) una serie. Solo en la sesión en curso. */
export async function logSet(db: Queryable, input: SetInput): Promise<SessionSet | null> {
  if (!(await isOpenExercise(db, input.sessionExerciseId))) return null;
  await db.run(
    `insert into workout_sets (id, session_exercise_id, set_number, weight_kg, reps, rir, rest_seconds, completed_at)
     values (?, ?, ?, ?, ?, ?, ?, ?)
     on conflict (session_exercise_id, set_number) do update
       set weight_kg = excluded.weight_kg, reps = excluded.reps, rir = excluded.rir`,
    [newId(), input.sessionExerciseId, input.setNumber, input.weightKg, input.reps, input.rir, input.restSeconds, nowIso()],
  );
  const row = await db.get<{ id: string; set_number: number; weight_kg: number; reps: number; rir: number | null; rest_seconds: number | null; completed_at: string }>(
    "select id, set_number, weight_kg, reps, rir, rest_seconds, completed_at from workout_sets where session_exercise_id = ? and set_number = ?",
    [input.sessionExerciseId, input.setNumber],
  );
  if (!row) return null;
  return {
    id: row.id,
    setNumber: row.set_number,
    weightKg: Number(row.weight_kg),
    reps: row.reps,
    rir: row.rir === null ? null : Number(row.rir),
    restSeconds: row.rest_seconds,
    completedAt: row.completed_at,
  };
}

export async function deleteSet(db: Queryable, setId: string): Promise<boolean> {
  const result = await db.run(
    `delete from workout_sets where id = ? and session_exercise_id in (
       select se.id from session_exercises se join workout_sessions s on s.id = se.session_id where s.status = 'in_progress')`,
    [setId],
  );
  return result.changes > 0;
}

export async function updateSessionExercise(db: Queryable, sessionExerciseId: string, patch: { discomfort: number; note: string | null }): Promise<boolean> {
  if (!(await isOpenExercise(db, sessionExerciseId))) return false;
  const result = await db.run("update session_exercises set discomfort = ?, note = ? where id = ?", [patch.discomfort, patch.note, sessionExerciseId]);
  return result.changes > 0;
}

/** Sustituye un ejercicio por una alternativa del catálogo. Solo antes de registrar series en él. */
export async function swapExercise(db: Db, sessionExerciseId: string, newExerciseId: string): Promise<boolean> {
  if (!getExercise(newExerciseId)) return false;
  return db.transaction(async (tx) => {
    const current = await tx.get<{ session_id: string; exercise_id: string; planned_exercise_id: string | null; status: string; sets: number }>(
      `select se.session_id, se.exercise_id, se.planned_exercise_id, s.status,
              (select count(*) from workout_sets ws where ws.session_exercise_id = se.id) as sets
         from session_exercises se join workout_sessions s on s.id = se.session_id
        where se.id = ?`,
      [sessionExerciseId],
    );
    if (!current || current.status !== "in_progress" || current.sets > 0) return false;
    const duplicate = await tx.get<{ id: string }>("select id from session_exercises where session_id = ? and exercise_id = ? and id <> ?", [
      current.session_id,
      newExerciseId,
      sessionExerciseId,
    ]);
    if (duplicate) return false;
    await tx.run("update session_exercises set planned_exercise_id = ?, exercise_id = ? where id = ?", [
      current.planned_exercise_id ?? current.exercise_id,
      newExerciseId,
      sessionExerciseId,
    ]);
    return true;
  });
}

/** Cierra la sesión en curso. Hace falta al menos una serie registrada. */
export async function finishSession(db: Queryable, sessionId: string, input: { energy: number | null; notes: string | null }): Promise<boolean> {
  const sets = await db.get<{ n: number }>(
    "select count(*) as n from workout_sets ws join session_exercises se on se.id = ws.session_exercise_id where se.session_id = ?",
    [sessionId],
  );
  if ((sets?.n ?? 0) === 0) return false;
  const result = await db.run("update workout_sessions set status = 'completed', finished_at = ?, energy = ?, notes = ? where id = ? and status = 'in_progress'", [
    nowIso(),
    input.energy,
    input.notes,
    sessionId,
  ]);
  return result.changes > 0;
}

/** Borra una sesión (en curso o ya terminada) con todas sus series. */
export async function deleteSession(db: Queryable, sessionId: string): Promise<boolean> {
  const result = await db.run("delete from workout_sessions where id = ?", [sessionId]);
  return result.changes > 0;
}

export type SessionSummary = {
  id: string;
  name: string;
  date: string;
  startedAt: string;
  durationMinutes: number | null;
  planDayId: string | null;
  blockId: string | null;
  exercises: number;
  sets: number;
  /** Suma de peso × repeticiones, en kg. */
  volumeKg: number;
  energy: number | null;
  discomfort: number;
};

const cutoff = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

/** Sesiones terminadas, de la más reciente a la más antigua. */
export async function listCompletedSessions(db: Queryable, options: { sinceDays?: number; limit?: number } = {}): Promise<SessionSummary[]> {
  const rows = await db.all<{
    id: string;
    name: string;
    started_at: string;
    finished_at: string | null;
    plan_day_id: string | null;
    block_id: string | null;
    energy: number | null;
    exercises: number;
    sets: number;
    volume: number | null;
    discomfort: number | null;
  }>(
    `select s.id, s.name, s.started_at, s.finished_at, s.plan_day_id, s.block_id, s.energy,
            count(distinct case when ws.id is not null then se.id end) as exercises,
            count(ws.id) as sets,
            sum(ws.weight_kg * ws.reps) as volume,
            max(se.discomfort) as discomfort
       from workout_sessions s
       left join session_exercises se on se.session_id = s.id
       left join workout_sets ws on ws.session_exercise_id = se.id
      where s.status = 'completed' and s.started_at > ?
      group by s.id
      order by s.started_at desc
      limit ?`,
    [cutoff(options.sinceDays ?? 3650), options.limit ?? 500],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    date: dateOf(row.started_at),
    startedAt: row.started_at,
    durationMinutes: row.finished_at
      ? Math.max(1, Math.round((new Date(row.finished_at).getTime() - new Date(row.started_at).getTime()) / 60000))
      : null,
    planDayId: row.plan_day_id,
    blockId: row.block_id,
    exercises: Number(row.exercises),
    sets: Number(row.sets),
    volumeKg: Math.round(Number(row.volume ?? 0)),
    energy: row.energy,
    discomfort: Number(row.discomfort ?? 0),
  }));
}

export type ExerciseLog = PastPerformance & { sessionId: string; exerciseId: string };

/**
 * Historial de series por ejercicio en sesiones terminadas, de la más reciente a la más antigua.
 * Sin `exerciseIds` (o vacío) devuelve el de todos los ejercicios.
 */
export async function getExerciseLogs(db: Queryable, options: { exerciseIds?: string[]; sinceDays?: number } = {}): Promise<ExerciseLog[]> {
  const ids = options.exerciseIds ?? [];
  const filter = ids.length > 0 ? `and se.exercise_id in (${ids.map(() => "?").join(", ")})` : "";
  const rows = await db.all<{
    session_id: string;
    started_at: string;
    exercise_id: string;
    session_exercise_id: string;
    discomfort: number;
    weight_kg: number;
    reps: number;
    rir: number | null;
  }>(
    `select s.id as session_id, s.started_at, se.exercise_id, se.id as session_exercise_id, se.discomfort,
            ws.weight_kg, ws.reps, ws.rir
       from session_exercises se
       join workout_sessions s on s.id = se.session_id
       join workout_sets ws on ws.session_exercise_id = se.id
      where s.status = 'completed' and s.started_at > ? ${filter}
      order by s.started_at desc, se.position, ws.set_number`,
    [cutoff(options.sinceDays ?? 365), ...ids],
  );

  const logs = new Map<string, ExerciseLog>();
  for (const row of rows) {
    let log = logs.get(row.session_exercise_id);
    if (!log) {
      log = { sessionId: row.session_id, exerciseId: row.exercise_id, date: dateOf(row.started_at), discomfort: row.discomfort, sets: [] };
      logs.set(row.session_exercise_id, log);
    }
    log.sets.push({ weightKg: Number(row.weight_kg), reps: row.reps, rir: row.rir === null ? null : Number(row.rir) });
  }
  return [...logs.values()];
}

/** Agrupa los registros por ejercicio conservando el orden (más reciente primero). */
export function groupLogs(logs: ExerciseLog[]): Map<string, ExerciseLog[]> {
  const grouped = new Map<string, ExerciseLog[]>();
  for (const log of logs) grouped.set(log.exerciseId, [...(grouped.get(log.exerciseId) ?? []), log]);
  return grouped;
}
