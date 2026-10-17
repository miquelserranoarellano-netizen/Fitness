/**
 * Vocabulario compartido por todo el dominio. Sin dependencias: se puede importar desde cliente y servidor.
 */

export const MUSCLES = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "abs",
] as const;
export type Muscle = (typeof MUSCLES)[number];

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: "Pecho",
  back: "Espalda",
  shoulders: "Hombros",
  biceps: "Bíceps",
  triceps: "Tríceps",
  forearms: "Antebrazos",
  quads: "Cuádriceps",
  hamstrings: "Isquiotibiales",
  glutes: "Glúteos",
  calves: "Gemelos",
  abs: "Abdomen",
};

export const EQUIPMENT = ["barbell", "dumbbells", "machines", "cables", "bench", "pullup_bar"] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: "Barras y discos",
  dumbbells: "Mancuernas",
  machines: "Máquinas",
  cables: "Poleas",
  bench: "Banco",
  pullup_bar: "Barra de dominadas",
};

export const BODY_AREAS = [
  "neck",
  "shoulder",
  "elbow",
  "wrist",
  "upper_back",
  "lower_back",
  "hip",
  "knee",
  "ankle",
  "other",
] as const;
export type BodyArea = (typeof BODY_AREAS)[number];

export const BODY_AREA_LABEL: Record<BodyArea, string> = {
  neck: "Cuello",
  shoulder: "Hombro",
  elbow: "Codo",
  wrist: "Muñeca",
  upper_back: "Espalda alta",
  lower_back: "Zona lumbar",
  hip: "Cadera",
  knee: "Rodilla",
  ankle: "Tobillo",
  other: "Otra zona",
};

export const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABEL: Record<Level, string> = {
  beginner: "Principiante",
  intermediate: "Intermedio",
  advanced: "Avanzado",
};

export const GOALS = ["muscle_gain", "fat_loss", "recomposition", "strength", "maintenance"] as const;
export type Goal = (typeof GOALS)[number];
export const GOAL_LABEL: Record<Goal, string> = {
  muscle_gain: "Ganar masa muscular",
  fat_loss: "Perder grasa",
  recomposition: "Recomposición corporal",
  strength: "Ganar fuerza",
  maintenance: "Mantenerme",
};

export const SECONDARY_GOALS = ["strength", "performance", "proportions", "posture", "health", "consistency"] as const;
export type SecondaryGoal = (typeof SECONDARY_GOALS)[number];
export const SECONDARY_GOAL_LABEL: Record<SecondaryGoal, string> = {
  strength: "Ganar fuerza",
  performance: "Mejorar el rendimiento",
  proportions: "Físico atlético y proporcionado",
  posture: "Mejorar la postura",
  health: "Salud general",
  consistency: "Crear el hábito",
};

export const EXPERIENCE = ["none", "lt6m", "6to12m", "1to2y", "2to4y", "gt4y"] as const;
export type Experience = (typeof EXPERIENCE)[number];
export const EXPERIENCE_LABEL: Record<Experience, string> = {
  none: "Nunca he entrenado con pesas",
  lt6m: "Menos de 6 meses",
  "6to12m": "Entre 6 y 12 meses",
  "1to2y": "Entre 1 y 2 años",
  "2to4y": "Entre 2 y 4 años",
  gt4y: "Más de 4 años",
};

export const SEXES = ["male", "female", "unspecified"] as const;
export type Sex = (typeof SEXES)[number];
export const SEX_LABEL: Record<Sex, string> = {
  male: "Hombre",
  female: "Mujer",
  unspecified: "Prefiero no decirlo",
};

export const JOB_ACTIVITY = ["sedentary", "light", "active", "very_active"] as const;
export type JobActivity = (typeof JOB_ACTIVITY)[number];
export const JOB_ACTIVITY_LABEL: Record<JobActivity, string> = {
  sedentary: "Sedentario (sentado casi todo el día)",
  light: "Ligero (de pie o caminando a ratos)",
  active: "Activo (de pie y en movimiento)",
  very_active: "Muy activo (trabajo físico)",
};

export const STRESS = ["low", "medium", "high"] as const;
export type Stress = (typeof STRESS)[number];
export const STRESS_LABEL: Record<Stress, string> = { low: "Bajo", medium: "Medio", high: "Alto" };

export const APPETITE = ["low", "normal", "high"] as const;
export type Appetite = (typeof APPETITE)[number];
export const APPETITE_LABEL: Record<Appetite, string> = {
  low: "Me cuesta comer suficiente",
  normal: "Normal",
  high: "Como mucho con facilidad",
};

export const DIETS = ["omnivore", "pescetarian", "vegetarian", "vegan"] as const;
export type Diet = (typeof DIETS)[number];
export const DIET_LABEL: Record<Diet, string> = {
  omnivore: "Como de todo",
  pescetarian: "Sin carne (con pescado)",
  vegetarian: "Vegetariana",
  vegan: "Vegana",
};

/** Reparto de macronutrientes (de SnapCal): solo cambia la proporción de hidratos y grasas, no las calorías. */
export const MACRO_STYLES = ["standard", "lowcarb", "keto"] as const;
export type MacroStyle = (typeof MACRO_STYLES)[number];
export const MACRO_STYLE_LABEL: Record<MacroStyle, string> = {
  standard: "Normal",
  lowcarb: "Baja en hidratos",
  keto: "Cetogénica (keto)",
};

export const ALLERGENS = ["gluten", "lactose", "egg", "nuts", "peanut", "fish", "shellfish", "soy"] as const;
export type Allergen = (typeof ALLERGENS)[number];
export const ALLERGEN_LABEL: Record<Allergen, string> = {
  gluten: "Gluten",
  lactose: "Lactosa / lácteos",
  egg: "Huevo",
  nuts: "Frutos secos",
  peanut: "Cacahuete",
  fish: "Pescado",
  shellfish: "Marisco",
  soy: "Soja",
};

export const UNITS = ["metric", "imperial"] as const;
export type Units = (typeof UNITS)[number];

export const LIMITATION_KINDS = ["injury", "pain", "mobility"] as const;
export type LimitationKind = (typeof LIMITATION_KINDS)[number];
export const LIMITATION_KIND_LABEL: Record<LimitationKind, string> = {
  injury: "Lesión anterior",
  pain: "Molestia actual",
  mobility: "Limitación de movilidad",
};

export const SEVERITIES = ["mild", "moderate", "severe"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_LABEL: Record<Severity, string> = {
  mild: "Leve",
  moderate: "Moderada",
  severe: "Importante",
};

/** Perímetros corporales, en el orden en que se piden. */
export const MEASURES = [
  "neck",
  "shoulders",
  "chest",
  "waist",
  "hips",
  "arm_relaxed",
  "arm_flexed",
  "forearm",
  "wrist",
  "thigh",
  "calf",
] as const;
export type Measure = (typeof MEASURES)[number];

export const MEASURE_LABEL: Record<Measure, string> = {
  neck: "Cuello",
  shoulders: "Hombros",
  chest: "Pecho",
  waist: "Cintura",
  hips: "Cadera",
  arm_relaxed: "Brazo relajado",
  arm_flexed: "Brazo contraído",
  forearm: "Antebrazo",
  wrist: "Muñeca",
  thigh: "Muslo",
  calf: "Gemelo",
};

/** Cómo medir cada perímetro siempre igual. */
export const MEASURE_HELP: Record<Measure, string> = {
  neck: "De pie, mirada al frente. Cinta horizontal justo por debajo de la nuez, sin apretar.",
  shoulders:
    "De pie, brazos relajados a los lados. Cinta horizontal alrededor de los hombros por la parte más ancha de los deltoides. Mejor con ayuda de otra persona.",
  chest: "Cinta horizontal a la altura de los pezones, pasando por debajo de las axilas. Mide al final de una espiración normal.",
  waist: "Cinta horizontal a la altura del ombligo, abdomen relajado (sin meter barriga), al final de una espiración normal.",
  hips: "Pies juntos. Cinta horizontal por la parte más prominente de los glúteos.",
  arm_relaxed: "Brazo colgando relajado. Cinta en el punto medio entre el hombro y el codo. Siempre el mismo brazo.",
  arm_flexed: "Brazo a 90° y bíceps contraído al máximo. Cinta por el punto más alto del bíceps. El mismo brazo que en relajado.",
  forearm: "Brazo extendido y relajado, palma hacia arriba. Cinta por la parte más ancha del antebrazo, cerca del codo.",
  wrist: "Cinta justo por encima del hueso de la muñeca (hacia el antebrazo), en la parte más estrecha.",
  thigh: "De pie, peso repartido en ambas piernas. Cinta horizontal en el punto medio entre la ingle y la rodilla. Siempre la misma pierna.",
  calf: "De pie, peso repartido. Cinta horizontal por la parte más ancha del gemelo.",
};

export const WEEKDAY_LABEL = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;
export const WEEKDAY_SHORT = ["L", "M", "X", "J", "V", "S", "D"] as const;
