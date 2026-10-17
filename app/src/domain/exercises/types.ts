import type { BodyArea, Equipment, Muscle } from "../types";

/** Patrón de movimiento: es lo que usa el generador para rellenar cada hueco de la rutina. */
export type Pattern =
  | "horizontal_press"
  | "incline_press"
  | "chest_fly"
  | "vertical_press"
  | "lateral_raise"
  | "rear_delt"
  | "vertical_pull"
  | "horizontal_row"
  | "lat_isolation"
  | "curl"
  | "curl_stretch"
  | "hammer_curl"
  | "triceps_pushdown"
  | "triceps_overhead"
  | "triceps_compound"
  | "forearm"
  | "squat"
  | "leg_press"
  | "knee_extension"
  | "lunge"
  | "hip_hinge"
  | "knee_flexion"
  | "hip_thrust"
  | "glute_isolation"
  | "calf_straight"
  | "calf_bent"
  | "abs_flexion"
  | "abs_leg_raise";

export type Exercise = {
  id: string;
  name: string;
  primary: Muscle;
  /** Músculos que trabajan de forma secundaria (cuentan media serie en el volumen semanal). */
  secondary: Muscle[];
  pattern: Pattern;
  kind: "compound" | "isolation";
  /** Todo lo necesario para hacerlo. Vacío = solo peso corporal. */
  equipment: Equipment[];
  /** Zonas que soportan más carga: sirve para evitarlo si hay una molestia en esa zona. */
  stress: BodyArea[];
  /** Dificultad técnica: 1 fácil de aprender · 3 exige práctica. */
  skill: 1 | 2 | 3;
  /** Salto de carga habitual en kg (por mano si `perSide`). */
  loadStep: number;
  /** La carga se anota por mano o por lado (mancuernas, poleas a una mano). */
  perSide?: boolean;
  /** Se hace con el peso corporal: la carga anotada es el lastre añadido (0 = sin lastre). */
  bodyweight?: boolean;
  steps: string[];
  mistakes: string[];
  cues: string[];
  /** Ejercicios equivalentes si no hay material o aparece una molestia. */
  alternatives: string[];
};
