import { EXERCISES, type Exercise, type Pattern } from "../exercises";
import {
  BODY_AREA_LABEL,
  MUSCLES,
  MUSCLE_LABEL,
  type BodyArea,
  type Equipment,
  type Goal,
  type Level,
  type Muscle,
  type Severity,
} from "../types";

/**
 * Generador determinista de rutinas.
 *
 * Con los mismos datos de entrada devuelve siempre la misma rutina, y cada decisión queda explicada
 * en `rationale`. No interviene ninguna IA: son reglas de programación del entrenamiento.
 */

export type SplitId = "full_body_2" | "full_body_3" | "upper_lower_4" | "upper_lower_arms_5" | "ulppl_5" | "ppl_6";

export const SPLIT_LABEL: Record<SplitId, string> = {
  full_body_2: "Cuerpo completo · 2 días",
  full_body_3: "Cuerpo completo · 3 días",
  upper_lower_4: "Torso-pierna · 4 días",
  upper_lower_arms_5: "Torso-pierna + brazos y hombros · 5 días",
  ulppl_5: "Torso-pierna + empuje-tirón-pierna · 5 días",
  ppl_6: "Empuje-tirón-pierna · 6 días",
};

export type PlanInput = {
  level: Level;
  goal: Goal;
  /** El usuario quiere además ganar fuerza: los básicos usan rangos de repeticiones algo más bajos. */
  strengthFocus: boolean;
  daysPerWeek: number;
  sessionMinutes: number;
  priorityMuscles: Muscle[];
  equipment: Equipment[];
  limitations: { area: BodyArea; severity: Severity }[];
  disliked: string[];
  favorites: string[];
  /**
   * Ajuste acumulado de series semanales por músculo, decidido al evaluar bloques anteriores
   * (positivo = más volumen). Desplaza el rango objetivo de ese músculo.
   */
  volumeAdjust?: Partial<Record<Muscle, number>>;
};

export type PlannedExercise = {
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  rirMin: number;
  rirMax: number;
  restSeconds: number;
  note: string | null;
};

export type PlannedDay = {
  name: string;
  focus: string;
  estimatedMinutes: number;
  exercises: PlannedExercise[];
};

export type VolumeRange = { min: number; max: number };

export type RationaleItem = { title: string; detail: string };

export type GeneratedPlan = {
  split: SplitId;
  weeks: number;
  days: PlannedDay[];
  /** Series semanales por músculo (las secundarias cuentan media serie). */
  weeklyVolume: Record<Muscle, number>;
  volumeTargets: Record<Muscle, VolumeRange>;
  priorityMuscles: Muscle[];
  rationale: RationaleItem[];
  warnings: string[];
  objectives: string[];
  expectedProgression: string;
  volumeCriteria: { increase: string[]; decrease: string[]; deload: string[] };
};

/* ───────────────────────────── Plantillas ───────────────────────────── */

type Role = "main" | "secondary" | "isolation";
type Slot = { muscle: Muscle; role: Role; patterns: Pattern[]; optional?: boolean };
type DayTemplate = { name: string; focus: string; slots: Slot[] };

const slot = (muscle: Muscle, role: Role, patterns: Pattern[], optional = false): Slot => ({
  muscle,
  role,
  patterns,
  optional,
});

const UPPER_A: DayTemplate = {
  name: "Torso A",
  focus: "Pecho, espalda, hombros y brazos",
  slots: [
    slot("chest", "main", ["horizontal_press"]),
    slot("back", "main", ["horizontal_row"]),
    slot("shoulders", "secondary", ["vertical_press"]),
    slot("back", "secondary", ["vertical_pull"]),
    slot("shoulders", "isolation", ["lateral_raise"]),
    slot("biceps", "isolation", ["curl"]),
    slot("triceps", "isolation", ["triceps_pushdown"]),
    slot("forearms", "isolation", ["forearm"], true),
  ],
};

const UPPER_B: DayTemplate = {
  name: "Torso B",
  focus: "Espalda, pecho superior, hombros y brazos",
  slots: [
    slot("chest", "main", ["incline_press"]),
    slot("back", "main", ["vertical_pull"]),
    slot("back", "secondary", ["horizontal_row"]),
    slot("chest", "isolation", ["chest_fly"]),
    slot("shoulders", "isolation", ["lateral_raise"]),
    slot("biceps", "isolation", ["curl_stretch", "hammer_curl", "curl"]),
    slot("triceps", "isolation", ["triceps_overhead", "triceps_pushdown"]),
    slot("shoulders", "isolation", ["rear_delt"], true),
  ],
};

const LOWER_A: DayTemplate = {
  name: "Pierna A",
  focus: "Cuádriceps, isquiotibiales y gemelos",
  slots: [
    slot("quads", "main", ["squat", "leg_press"]),
    slot("hamstrings", "main", ["hip_hinge"]),
    slot("quads", "secondary", ["leg_press", "lunge"], true),
    slot("hamstrings", "isolation", ["knee_flexion"]),
    slot("quads", "isolation", ["knee_extension"]),
    slot("calves", "isolation", ["calf_straight", "calf_bent"]),
    slot("abs", "isolation", ["abs_flexion", "abs_leg_raise"], true),
  ],
};

const LOWER_B: DayTemplate = {
  name: "Pierna B",
  focus: "Glúteos, cuádriceps, isquiotibiales y gemelos",
  slots: [
    slot("quads", "main", ["leg_press", "squat"]),
    slot("glutes", "main", ["hip_thrust", "hip_hinge"]),
    slot("quads", "secondary", ["lunge"]),
    slot("hamstrings", "isolation", ["knee_flexion"]),
    slot("quads", "isolation", ["knee_extension"], true),
    slot("calves", "isolation", ["calf_bent", "calf_straight"]),
    slot("abs", "isolation", ["abs_leg_raise", "abs_flexion"], true),
  ],
};

const ARMS: DayTemplate = {
  name: "Brazos y hombros",
  focus: "Bíceps, tríceps, antebrazos y hombros",
  slots: [
    slot("shoulders", "secondary", ["vertical_press"]),
    slot("biceps", "isolation", ["curl"]),
    slot("triceps", "isolation", ["triceps_overhead"]),
    slot("shoulders", "isolation", ["lateral_raise"]),
    slot("biceps", "isolation", ["hammer_curl", "curl_stretch"]),
    slot("triceps", "isolation", ["triceps_pushdown", "triceps_compound"]),
    slot("forearms", "isolation", ["forearm"]),
    slot("shoulders", "isolation", ["rear_delt"], true),
  ],
};

const PUSH_A: DayTemplate = {
  name: "Empuje A",
  focus: "Pecho, hombros y tríceps",
  slots: [
    slot("chest", "main", ["horizontal_press"]),
    slot("shoulders", "secondary", ["vertical_press"]),
    slot("chest", "secondary", ["incline_press"]),
    slot("shoulders", "isolation", ["lateral_raise"]),
    slot("triceps", "isolation", ["triceps_pushdown"]),
    slot("triceps", "isolation", ["triceps_overhead"]),
  ],
};

const PUSH_B: DayTemplate = {
  name: "Empuje B",
  focus: "Pecho superior, hombros y tríceps",
  slots: [
    slot("chest", "main", ["incline_press"]),
    slot("shoulders", "secondary", ["vertical_press"]),
    slot("chest", "isolation", ["chest_fly"]),
    slot("shoulders", "isolation", ["lateral_raise"]),
    slot("triceps", "isolation", ["triceps_overhead"]),
    slot("triceps", "secondary", ["triceps_compound", "triceps_pushdown"]),
  ],
};

const PULL_A: DayTemplate = {
  name: "Tirón A",
  focus: "Espalda, bíceps y antebrazos",
  slots: [
    slot("back", "main", ["vertical_pull"]),
    slot("back", "secondary", ["horizontal_row"]),
    slot("back", "isolation", ["lat_isolation"], true),
    slot("shoulders", "isolation", ["rear_delt"]),
    slot("biceps", "isolation", ["curl"]),
    slot("biceps", "isolation", ["hammer_curl"]),
    slot("forearms", "isolation", ["forearm"], true),
  ],
};

const PULL_B: DayTemplate = {
  name: "Tirón B",
  focus: "Espalda, bíceps y antebrazos",
  slots: [
    slot("back", "main", ["horizontal_row"]),
    slot("back", "secondary", ["vertical_pull"]),
    slot("shoulders", "isolation", ["rear_delt"]),
    slot("biceps", "isolation", ["curl_stretch", "curl"]),
    slot("biceps", "isolation", ["hammer_curl"]),
    slot("forearms", "isolation", ["forearm"], true),
  ],
};

const FULL_A: DayTemplate = {
  name: "Cuerpo completo A",
  focus: "Sentadilla, press y tirón vertical",
  slots: [
    slot("quads", "main", ["squat", "leg_press"]),
    slot("chest", "main", ["horizontal_press"]),
    slot("back", "main", ["vertical_pull"]),
    slot("hamstrings", "isolation", ["knee_flexion"]),
    slot("shoulders", "isolation", ["lateral_raise"]),
    slot("biceps", "isolation", ["curl"]),
    slot("triceps", "isolation", ["triceps_pushdown"]),
    slot("calves", "isolation", ["calf_straight", "calf_bent"], true),
  ],
};

const FULL_B: DayTemplate = {
  name: "Cuerpo completo B",
  focus: "Bisagra de cadera, press inclinado y remo",
  slots: [
    slot("hamstrings", "main", ["hip_hinge"]),
    slot("chest", "main", ["incline_press"]),
    slot("back", "main", ["horizontal_row"]),
    slot("quads", "secondary", ["leg_press", "lunge", "knee_extension"]),
    slot("shoulders", "isolation", ["lateral_raise"]),
    slot("triceps", "isolation", ["triceps_overhead", "triceps_pushdown"]),
    slot("biceps", "isolation", ["hammer_curl", "curl_stretch", "curl"]),
    slot("abs", "isolation", ["abs_flexion", "abs_leg_raise"], true),
  ],
};

const FULL_C: DayTemplate = {
  name: "Cuerpo completo C",
  focus: "Prensa, tirón, press de hombros y glúteos",
  slots: [
    slot("quads", "main", ["leg_press", "squat"]),
    slot("back", "main", ["vertical_pull"]),
    slot("chest", "secondary", ["horizontal_press"]),
    slot("glutes", "secondary", ["hip_thrust", "hip_hinge"]),
    slot("shoulders", "secondary", ["vertical_press"]),
    slot("biceps", "isolation", ["curl"]),
    slot("triceps", "isolation", ["triceps_pushdown"]),
    slot("calves", "isolation", ["calf_bent", "calf_straight"]),
    slot("abs", "isolation", ["abs_leg_raise", "abs_flexion"], true),
  ],
};

const rename = (template: DayTemplate, name: string): DayTemplate => ({ ...template, name });

const SPLIT_DAYS: Record<SplitId, DayTemplate[]> = {
  full_body_2: [FULL_A, FULL_B],
  full_body_3: [FULL_A, FULL_B, FULL_C],
  upper_lower_4: [UPPER_A, LOWER_A, UPPER_B, LOWER_B],
  upper_lower_arms_5: [UPPER_A, LOWER_A, ARMS, UPPER_B, LOWER_B],
  ulppl_5: [UPPER_A, LOWER_A, rename(PUSH_B, "Empuje"), rename(PULL_B, "Tirón"), LOWER_B],
  ppl_6: [PUSH_A, PULL_A, LOWER_A, PUSH_B, PULL_B, LOWER_B],
};

/* ───────────────────────────── Distribución ───────────────────────────── */

const ARM_MUSCLES: Muscle[] = ["biceps", "triceps", "forearms", "shoulders"];

export function chooseSplit(input: Pick<PlanInput, "daysPerWeek" | "level" | "priorityMuscles">): {
  split: SplitId;
  reason: string;
} {
  const days = Math.min(6, Math.max(2, Math.round(input.daysPerWeek)));
  const armPriority = input.priorityMuscles.filter((muscle) => ARM_MUSCLES.includes(muscle)).length;

  switch (days) {
    case 2:
      return {
        split: "full_body_2",
        reason:
          "Con 2 días, la única forma de estimular cada músculo dos veces por semana es entrenar el cuerpo completo en cada sesión.",
      };
    case 3:
      return {
        split: "full_body_3",
        reason:
          "Con 3 días, tres sesiones de cuerpo completo dan a cada músculo una frecuencia de 2-3 estímulos semanales con sesiones manejables.",
      };
    case 4:
      return {
        split: "upper_lower_4",
        reason:
          "Con 4 días, torso-pierna permite trabajar cada músculo 2 veces por semana y repartir el volumen sin sesiones eternas.",
      };
    case 5:
      if (armPriority >= 2) {
        return {
          split: "upper_lower_arms_5",
          reason:
            "Con 5 días y los brazos como prioridad, a la base torso-pierna (frecuencia 2) se añade un día específico de brazos y hombros: así reciben 3 estímulos semanales estando frescos.",
        };
      }
      return {
        split: "ulppl_5",
        reason:
          "Con 5 días se combina torso-pierna con empuje-tirón-pierna: cada músculo se entrena 2 veces por semana con el volumen bien repartido.",
      };
    default:
      return {
        split: "ppl_6",
        reason:
          input.level === "beginner"
            ? "Con 6 días se usa empuje-tirón-pierna dos veces por semana, con sesiones cortas. Para tu nivel, 3-4 días bien hechos darían un resultado similar: si algún día te falta tiempo o energía, no pasa nada por saltárselo."
            : "Con 6 días, empuje-tirón-pierna dos veces por semana reparte el volumen en sesiones más cortas y mantiene la frecuencia 2.",
      };
  }
}

/* ───────────────────────────── Volumen ───────────────────────────── */

const BASE_RANGE: Record<Level, VolumeRange> = {
  beginner: { min: 6, max: 10 },
  intermediate: { min: 9, max: 14 },
  advanced: { min: 11, max: 18 },
};

// Los rangos cuentan trabajo directo e indirecto (media serie por músculo secundario). Hombros y brazos
// reciben mucho trabajo indirecto de presses y remos, de ahí que su rango no sea menor que el del pecho.
const MUSCLE_FACTOR: Record<Muscle, number> = {
  chest: 1,
  back: 1.1,
  shoulders: 1.2,
  biceps: 1,
  triceps: 1,
  forearms: 0.4,
  quads: 1,
  hamstrings: 0.9,
  // Los glúteos trabajan en casi todos los ejercicios de pierna: su rango incluye ese trabajo indirecto.
  glutes: 1,
  calves: 0.7,
  abs: 0.5,
};

export function volumeTargets(
  level: Level,
  priority: Muscle[],
  adjust: Partial<Record<Muscle, number>> = {},
): Record<Muscle, VolumeRange> {
  const base = BASE_RANGE[level];
  const out = {} as Record<Muscle, VolumeRange>;
  for (const muscle of MUSCLES) {
    // Un grupo prioritario sube su mínimo un 30 % y su techo un 60 %: así cabe trabajo directo de sobra
    // aunque ya reciba series indirectas de los ejercicios compuestos.
    const isPriority = priority.includes(muscle);
    const delta = adjust[muscle] ?? 0;
    const min = Math.max(0, Math.round(base.min * MUSCLE_FACTOR[muscle] * (isPriority ? 1.3 : 1)) + delta);
    out[muscle] = { min, max: Math.max(min + 2, Math.round(base.max * MUSCLE_FACTOR[muscle] * (isPriority ? 1.6 : 1)) + delta) };
  }
  return out;
}

/** Series semanales por músculo: 1 por serie del músculo principal y 0,5 por cada secundario. */
export function weeklyVolume(entries: { exerciseId: string; sets: number }[]): Record<Muscle, number> {
  const out = Object.fromEntries(MUSCLES.map((muscle) => [muscle, 0])) as Record<Muscle, number>;
  for (const entry of entries) {
    const exercise = EXERCISES.find((candidate) => candidate.id === entry.exerciseId);
    if (!exercise) continue;
    out[exercise.primary] += entry.sets;
    for (const muscle of exercise.secondary) out[muscle] += entry.sets * 0.5;
  }
  return out;
}

/* ───────────────────────────── Prescripción ───────────────────────────── */

const PATTERN_REPS: Partial<Record<Pattern, [number, number]>> = {
  lateral_raise: [12, 20],
  rear_delt: [12, 20],
  forearm: [12, 20],
  calf_straight: [10, 15],
  calf_bent: [10, 15],
  abs_flexion: [10, 15],
  abs_leg_raise: [8, 15],
  hip_hinge: [8, 12],
  hip_thrust: [8, 12],
  lunge: [8, 12],
  leg_press: [10, 15],
  knee_extension: [10, 15],
  knee_flexion: [10, 15],
};

function prescribe(exercise: Exercise, role: Role, input: PlanInput): Omit<PlannedExercise, "exerciseId" | "sets" | "note"> {
  const beginner = input.level === "beginner";
  let reps: [number, number];
  let rest: number;
  let rir: [number, number];

  if (role === "main") {
    reps = input.strengthFocus && !beginner ? [5, 8] : beginner ? [8, 12] : [6, 10];
    rest = 150;
    rir = beginner ? [2, 3] : [1, 2];
  } else if (role === "secondary") {
    reps = [8, 12];
    rest = 120;
    rir = beginner ? [2, 3] : [1, 2];
  } else {
    reps = [10, 15];
    rest = 75;
    rir = beginner ? [1, 2] : [0, 1];
  }

  const override = PATTERN_REPS[exercise.pattern];
  if (override && !(role === "main" && input.strengthFocus && !beginner && exercise.pattern === "hip_hinge")) reps = override;
  if (exercise.primary === "calves" || exercise.primary === "abs" || exercise.primary === "forearms") rest = 60;
  // En sesiones cortas se recortan los descansos antes que el trabajo.
  if (isCompact(input)) rest = role === "main" ? 120 : role === "secondary" ? 90 : 60;

  return { repMin: reps[0], repMax: reps[1], rirMin: rir[0], rirMax: rir[1], restSeconds: rest };
}

const WORK_SECONDS = 40;
const WARMUP_MINUTES = 6;

const isCompact = (input: Pick<PlanInput, "sessionMinutes">) => input.sessionMinutes <= 45;

/** Duración aproximada de una sesión a partir de sus series y descansos (con calentamiento). */
export function estimateSessionMinutes(exercises: { sets: number; restSeconds: number }[]): number {
  const work = exercises.reduce((total, exercise) => total + 2 + (exercise.sets * (WORK_SECONDS + exercise.restSeconds)) / 60, 0);
  return Math.round((WARMUP_MINUTES + work) / 5) * 5;
}

function slotMinutes(role: Role, sets: number, restSeconds: number): number {
  const setup = role === "main" ? 3 : 1.5; // series de aproximación y cambio de máquina
  return setup + (sets * (WORK_SECONDS + restSeconds)) / 60;
}

/* ───────────────────────────── Generación ───────────────────────────── */

type Work = {
  day: number;
  slot: Slot;
  exercise: Exercise;
  sets: number;
  active: boolean;
  note: string | null;
  rx: ReturnType<typeof prescribe>;
};

const SEVERE: Severity[] = ["moderate", "severe"];

export function generatePlan(input: PlanInput): GeneratedPlan {
  const { split, reason: splitReason } = chooseSplit(input);
  const templates = SPLIT_DAYS[split];
  const priority = input.priorityMuscles;
  const targets = volumeTargets(input.level, priority, input.volumeAdjust);
  const warnings: string[] = [];
  const rationale: RationaleItem[] = [{ title: SPLIT_LABEL[split], detail: splitReason }];

  const blockedAreas = new Set(input.limitations.filter((l) => SEVERE.includes(l.severity)).map((l) => l.area));
  const mildAreas = new Set(input.limitations.filter((l) => l.severity === "mild").map((l) => l.area));
  const hasEquipment = (exercise: Exercise) => exercise.equipment.every((item) => input.equipment.includes(item));

  /* 1. Elegir un ejercicio para cada hueco. */
  const usedInWeek = new Map<string, number>();
  const avoided = new Set<string>();
  const work: Work[] = [];

  templates.forEach((template, day) => {
    const usedInDay = new Set<string>();
    for (const current of template.slots) {
      let blockedByLimitation = false;
      const candidates = EXERCISES.filter((exercise) => {
        if (!current.patterns.includes(exercise.pattern)) return false;
        if (!hasEquipment(exercise) || input.disliked.includes(exercise.id) || usedInDay.has(exercise.id)) return false;
        if (exercise.stress.some((area) => blockedAreas.has(area))) {
          blockedByLimitation = true;
          avoided.add(exercise.name);
          return false;
        }
        return true;
      });

      if (candidates.length === 0) {
        if (!current.optional) {
          warnings.push(
            blockedByLimitation
              ? `En «${template.name}» no he incluido trabajo directo de ${MUSCLE_LABEL[current.muscle].toLowerCase()} porque todos los ejercicios posibles cargan una zona en la que has indicado una limitación. Conviene que un profesional sanitario la valore antes de entrenarla con carga.`
              : `Con tu equipamiento no hay un ejercicio adecuado para ${MUSCLE_LABEL[current.muscle].toLowerCase()} en «${template.name}».`,
          );
        }
        continue;
      }

      const score = (exercise: Exercise) => {
        let value = current.patterns.indexOf(exercise.pattern) * 100;
        if (input.favorites.includes(exercise.id)) value -= 40;
        value += (usedInWeek.get(exercise.id) ?? 0) * 30;
        if (input.level === "beginner") value += exercise.skill === 3 ? 60 : exercise.skill === 2 ? 10 : 0;
        if (exercise.stress.some((area) => mildAreas.has(area))) value += 35;
        return value + EXERCISES.indexOf(exercise) * 0.01;
      };
      const chosen = candidates.reduce((best, candidate) => (score(candidate) < score(best) ? candidate : best));

      const mildHit = chosen.stress.find((area) => mildAreas.has(area));
      usedInDay.add(chosen.id);
      usedInWeek.set(chosen.id, (usedInWeek.get(chosen.id) ?? 0) + 1);

      const beginner = input.level === "beginner";
      const isPriority = priority.includes(chosen.primary);
      let sets = current.role === "isolation" ? (beginner ? 2 : 3) : 3;
      if (isPriority) sets += 1;
      sets = Math.min(sets, input.level === "advanced" ? 5 : 4);

      work.push({
        day,
        slot: current,
        exercise: chosen,
        sets,
        active: !current.optional || isPriority,
        note: mildHit
          ? `Tienes registrada una molestia leve en ${BODY_AREA_LABEL[mildHit].toLowerCase()}. Si aparece dolor, para y cambia a una alternativa.`
          : null,
        rx: prescribe(chosen, current.role, input),
      });
    }
  });

  const isPriority = (item: Work) => priority.includes(item.exercise.primary);
  const volume = () => weeklyVolume(work.filter((w) => w.active).map((w) => ({ exerciseId: w.exercise.id, sets: w.sets })));
  const dayMinutes = (day: number) =>
    WARMUP_MINUTES +
    work
      .filter((w) => w.day === day && w.active)
      .reduce((total, w) => total + slotMinutes(w.slot.role, w.sets, w.rx.restSeconds), 0);

  /*
   * 2. Recortar los músculos que superan su máximo semanal, de lo menos a lo más valioso:
   *    series extra (más de 3) → ejercicios opcionales → accesorios a 2 series → básicos a 2 series
   *    → quitar un accesorio. Así los ejercicios principales conservan sus series mientras se pueda.
   */
  const stuck = new Set<Muscle>();
  // Orden de recorte: accesorios, luego secundarios, luego básicos. Las elevaciones laterales son la
  // excepción: para el hombro valen más que un press secundario, que ya se solapa con el trabajo de pecho.
  const roleRank = (w: Work) =>
    w.exercise.pattern === "lateral_raise" ? 1.5 : w.slot.role === "isolation" ? 0 : w.slot.role === "secondary" ? 1 : 2;
  for (let guard = 0; guard < 300; guard++) {
    const current = volume();
    const over = MUSCLES.find((muscle) => !stuck.has(muscle) && current[muscle] > targets[muscle].max + 0.5);
    if (!over) break;
    const own = work.filter((w) => w.active && w.exercise.primary === over).sort((a, b) => roleRank(a) - roleRank(b) || b.sets - a.sets);

    const extra = own.find((w) => w.sets > 3);
    const optional = own.length > 1 ? own.find((w) => w.slot.optional) : undefined;
    const accessory = own.find((w) => w.slot.role !== "main" && w.sets > 2);
    const main = own.find((w) => w.sets > 2);
    const removable = own.length > 1 ? own.find((w) => w.slot.role !== "main") : undefined;

    if (extra) extra.sets -= 1;
    else if (optional) optional.active = false;
    else if (accessory) accessory.sets -= 1;
    else if (main) main.sets -= 1;
    else if (removable) removable.active = false;
    // Si ya no se puede recortar (el exceso viene del trabajo indirecto), se pasa al siguiente músculo.
    else stuck.add(over);
  }

  /* 3. Ajustar cada sesión al tiempo disponible, quitando primero lo menos valioso. */
  const trimmedDays = new Set<number>();
  const removalCost = (item: Work, current: Record<Muscle, number>) => {
    let cost = 0;
    if (isPriority(item)) cost += 10;
    // Los ejercicios principales son lo último que pierde series, por detrás incluso de las series
    // extra que se dan a los grupos prioritarios.
    if (item.slot.role === "main") cost += 9;
    if (item.slot.role === "secondary") cost += 4;
    if (current[item.exercise.primary] <= targets[item.exercise.primary].min) cost += 8;
    if (item.sets > 3) cost -= 4;
    if (item.slot.optional) cost -= 5;
    return cost;
  };

  templates.forEach((_, day) => {
    for (let guard = 0; guard < 100 && dayMinutes(day) > input.sessionMinutes + 2; guard++) {
      trimmedDays.add(day);
      const current = volume();
      const inDay = work.filter((w) => w.day === day && w.active);
      const byCost = (a: Work, b: Work) => removalCost(a, current) - removalCost(b, current);
      const reducible = inDay.filter((w) => w.sets > 2).sort(byCost)[0];
      if (reducible) {
        reducible.sets -= 1;
        continue;
      }
      const removable = inDay.filter((w) => w.slot.role !== "main").sort(byCost)[0] ?? inDay[inDay.length - 1];
      if (!removable || inDay.length <= 3) break;
      removable.active = false;
    }
  });

  /* 4. Si sobra tiempo, completar los músculos que se han quedado por debajo de su mínimo. */
  const maxSets = input.level === "advanced" ? 5 : 4;
  for (let guard = 0; guard < 200; guard++) {
    const current = volume();
    const lacking = MUSCLES.filter((muscle) => current[muscle] < targets[muscle].min).sort(
      (a, b) =>
        Number(priority.includes(b)) - Number(priority.includes(a)) ||
        targets[b].min - current[b] - (targets[a].min - current[a]),
    );
    let changed = false;
    for (const muscle of lacking) {
      const grow = work.find(
        (w) =>
          w.active &&
          w.exercise.primary === muscle &&
          w.sets < maxSets &&
          dayMinutes(w.day) + (WORK_SECONDS + w.rx.restSeconds) / 60 <= input.sessionMinutes + 2,
      );
      if (grow) {
        grow.sets += 1;
        changed = true;
        break;
      }
      const revive = work.find(
        (w) =>
          !w.active &&
          w.exercise.primary === muscle &&
          dayMinutes(w.day) + slotMinutes(w.slot.role, 2, w.rx.restSeconds) <= input.sessionMinutes + 2,
      );
      if (revive) {
        revive.active = true;
        revive.sets = 2;
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }

  /* 5. Resultado y explicación. */
  const finalVolume = volume();
  const days: PlannedDay[] = templates.map((template, day) => ({
    name: template.name,
    focus: template.focus,
    estimatedMinutes: Math.round(dayMinutes(day)),
    exercises: work
      .filter((w) => w.day === day && w.active)
      .map((w) => ({ exerciseId: w.exercise.id, sets: w.sets, note: w.note, ...w.rx })),
  }));

  const below = MUSCLES.filter((muscle) => finalVolume[muscle] < targets[muscle].min);
  if (below.length > 0) {
    warnings.push(
      `Con ${input.daysPerWeek} días de ${input.sessionMinutes} minutos, ${listMuscles(below)} ${below.length === 1 ? "queda" : "quedan"} algo por debajo del volumen semanal recomendado para tu nivel. Es un punto de partida válido; si puedes ampliar el tiempo por sesión, se ajustará.`,
    );
  }

  if (priority.length > 0) {
    rationale.push({
      title: "Prioridades musculares",
      detail: `${capitalize(listMuscles(priority))} ${priority.length === 1 ? "recibe" : "reciben"} más series semanales que el resto y, cuando el tiempo obliga a recortar, son lo último que se toca. El resto de grupos se mantiene dentro de su rango para no descuidar las proporciones.`,
    });
  }
  rationale.push({
    title: "Volumen de partida",
    detail: `Se empieza en la parte ${input.level === "beginner" ? "baja" : "media"} del rango útil para un nivel ${levelWord(input.level)} (${BASE_RANGE[input.level].min}-${BASE_RANGE[input.level].max} series semanales por grupo grande). Empezar con más no acelera el progreso y deja menos margen para subir cuando haga falta.`,
  });
  const rests = isCompact(input)
    ? "Como tus sesiones son cortas, los descansos se ajustan a 2 minutos en los básicos y 1 minuto en los accesorios."
    : "Descansos de 2-3 minutos en los básicos y alrededor de 1 minuto en los accesorios.";
  rationale.push({
    title: "Intensidad y descansos",
    detail:
      input.level === "beginner"
        ? `Los ejercicios principales se hacen dejando 2-3 repeticiones en reserva (RIR) para consolidar la técnica; los accesorios, algo más cerca del fallo. ${rests}`
        : `Los ejercicios principales se hacen con 1-2 repeticiones en reserva (RIR) y los accesorios con 0-1. ${rests}`,
  });
  if (trimmedDays.size > 0) {
    rationale.push({
      title: "Ajuste al tiempo disponible",
      detail: `Para que cada sesión quepa en ${input.sessionMinutes} minutos se han reducido series, empezando por los ejercicios accesorios de los grupos no prioritarios.`,
    });
  }
  if (avoided.size > 0) {
    rationale.push({
      title: "Limitaciones físicas",
      detail: `Por las molestias o lesiones que has indicado se han evitado: ${[...avoided].slice(0, 6).join(", ")}${avoided.size > 6 ? "…" : ""}. En su lugar se usan alternativas que cargan menos esa zona. Si una molestia persiste o empeora, consulta a un profesional sanitario.`,
    });
  }

  const objectives = [
    priority.length > 0
      ? `Dar prioridad a ${listMuscles(priority)} sin descuidar el resto.`
      : "Desarrollo equilibrado de todos los grupos musculares.",
    "Establecer cargas de referencia en cada ejercicio durante la primera semana.",
    "Progresar en repeticiones o carga manteniendo la técnica y el RIR indicado.",
  ];

  return {
    split,
    weeks: 4,
    days,
    weeklyVolume: finalVolume,
    volumeTargets: targets,
    priorityMuscles: priority,
    rationale,
    warnings,
    objectives,
    expectedProgression:
      input.level === "beginner"
        ? "Sumar repeticiones o carga casi todas las semanas en los ejercicios principales."
        : input.level === "intermediate"
          ? "Sumar una repetición o el salto mínimo de carga cada 1-2 semanas en los ejercicios principales."
          : "Progresos pequeños y acumulados a lo largo del bloque; mantener cargas con mejor ejecución también cuenta.",
    volumeCriteria: {
      increase: [
        "Un grupo muscular lleva 2-3 semanas sin progresar, con buena adherencia, sueño y alimentación.",
        "Te recuperas bien entre sesiones (sin agujetas persistentes ni fatiga acumulada).",
        "El aumento es pequeño: 1-2 series semanales en ese grupo, nunca en todos a la vez.",
      ],
      decrease: [
        "El rendimiento baja en dos sesiones seguidas del mismo grupo muscular.",
        "Aparecen molestias articulares o agujetas que no desaparecen antes de la siguiente sesión.",
        "Duermes mal o tu energía es baja de forma mantenida.",
      ],
      deload: [
        "Solo si al final del bloque coinciden varias señales de fatiga: caída de rendimiento en varios grupos, energía baja en las revisiones semanales o molestias articulares.",
        "Consiste en una semana con la mitad de series y cargas algo menores. No se programa por defecto.",
      ],
    },
  };
}

function listMuscles(muscles: Muscle[]): string {
  const names = muscles.map((muscle) => MUSCLE_LABEL[muscle].toLowerCase());
  if (names.length <= 1) return names[0] ?? "";
  const last = names[names.length - 1]!;
  const joiner = /^(i|hi)/.test(last) ? " e " : " y ";
  return `${names.slice(0, -1).join(", ")}${joiner}${last}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function levelWord(level: Level): string {
  return level === "beginner" ? "principiante" : level === "intermediate" ? "intermedio" : "avanzado";
}
