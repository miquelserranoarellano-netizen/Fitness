import type { Queryable } from "./types";

/**
 * Esquema de la base de datos local.
 * - 1: el de la web (`smart-fitness-coach/src/db/migrations`) traducido a SQLite, sin cuentas ni sesiones
 *   (un usuario por teléfono) y con `food_entries` como hueco para las comidas.
 * - 2: la parte de SnapCal (alimentos de cada comida, favoritas, agua, pasos y preferencias de dieta).
 * - 3: objetivo de calorías y macros puesto a mano (motivo «manual»).
 *
 * Una migración aplicada no se edita: se añade otra al final de la lista.
 */
export const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: "nucleo",
    sql: `
create table profiles (
  id integer primary key check (id = 1),
  display_name text not null,
  age_years integer not null check (age_years between 14 and 100),
  age_recorded_on text not null,
  sex text not null check (sex in ('male', 'female', 'unspecified')),
  height_cm real not null check (height_cm between 120 and 230),
  country text,
  units text not null default 'metric' check (units in ('metric', 'imperial')),
  primary_goal text not null check (primary_goal in ('muscle_gain', 'fat_loss', 'recomposition', 'strength', 'maintenance')),
  secondary_goals text not null default '[]',
  priority_muscles text not null default '[]',
  target_date text,
  training_experience text not null check (training_experience in ('none', 'lt6m', '6to12m', '1to2y', '2to4y', 'gt4y')),
  structured_program integer not null default 0,
  tracks_loads integer not null default 0,
  experience_level text not null check (experience_level in ('beginner', 'intermediate', 'advanced')),
  previous_routines text,
  favorite_exercises text not null default '[]',
  disliked_exercises text not null default '[]',
  strength_marks text not null default '[]',
  weak_muscles text not null default '[]',
  mobility_notes text,
  days_per_week integer not null check (days_per_week between 2 and 6),
  training_weekdays text not null default '[]',
  session_minutes integer not null check (session_minutes between 30 and 150),
  equipment text not null default '[]',
  sleep_hours real check (sleep_hours between 3 and 12),
  daily_steps integer check (daily_steps between 0 and 40000),
  job_activity text not null default 'sedentary' check (job_activity in ('sedentary', 'light', 'active', 'very_active')),
  stress_level text not null default 'medium' check (stress_level in ('low', 'medium', 'high')),
  meals_per_day integer not null default 4 check (meals_per_day between 2 and 7),
  appetite text not null default 'normal' check (appetite in ('low', 'normal', 'high')),
  diet_preference text not null default 'omnivore' check (diet_preference in ('omnivore', 'pescetarian', 'vegetarian', 'vegan')),
  allergies text not null default '[]',
  intolerance_notes text,
  favorite_foods text,
  excluded_foods text,
  weekly_food_budget real check (weekly_food_budget >= 0),
  supplements text,
  weigh_in_weekday integer not null default 1 check (weigh_in_weekday between 1 and 7),
  reminders_enabled integer not null default 1,
  health_consent_at text,
  photos_consent_at text,
  onboarding_completed_at text,
  created_at text not null,
  updated_at text not null
);

create table limitations (
  id text primary key,
  kind text not null check (kind in ('injury', 'pain', 'mobility')),
  body_area text not null check (body_area in ('neck', 'shoulder', 'elbow', 'wrist', 'upper_back', 'lower_back', 'hip', 'knee', 'ankle', 'other')),
  severity text not null default 'mild' check (severity in ('mild', 'moderate', 'severe')),
  description text,
  active integer not null default 1,
  created_at text not null,
  resolved_at text
);

create table body_weights (
  id text primary key,
  measured_on text not null unique,
  weight_kg real not null check (weight_kg between 30 and 300),
  note text,
  created_at text not null
);

create table body_measurements (
  id text primary key,
  measured_on text not null unique,
  neck_cm real,
  shoulders_cm real,
  chest_cm real,
  waist_cm real,
  hips_cm real,
  arm_relaxed_cm real,
  arm_flexed_cm real,
  forearm_cm real,
  wrist_cm real,
  thigh_cm real,
  calf_cm real,
  note text,
  created_at text not null
);

create table training_blocks (
  id text primary key,
  number integer not null unique,
  status text not null default 'active' check (status in ('active', 'completed')),
  split text not null,
  weeks_planned integer not null check (weeks_planned between 3 and 8),
  started_on text not null,
  ended_on text,
  rationale text not null,
  evaluation text,
  created_at text not null
);
create unique index training_blocks_one_active on training_blocks (status) where status = 'active';

create table plan_days (
  id text primary key,
  block_id text not null references training_blocks (id) on delete cascade,
  position integer not null,
  name text not null,
  focus text not null,
  unique (block_id, position)
);

create table plan_exercises (
  id text primary key,
  plan_day_id text not null references plan_days (id) on delete cascade,
  position integer not null,
  exercise_id text not null,
  sets integer not null check (sets between 1 and 8),
  rep_min integer not null,
  rep_max integer not null,
  rir_min integer not null,
  rir_max integer not null,
  rest_seconds integer not null,
  note text
);
create index plan_exercises_day_idx on plan_exercises (plan_day_id, position);

create table workout_sessions (
  id text primary key,
  block_id text references training_blocks (id) on delete set null,
  plan_day_id text references plan_days (id) on delete set null,
  name text not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  started_at text not null,
  finished_at text,
  energy integer check (energy between 1 and 5),
  notes text
);
create index workout_sessions_started_idx on workout_sessions (started_at desc);
create unique index workout_sessions_one_open on workout_sessions (status) where status = 'in_progress';

create table session_exercises (
  id text primary key,
  session_id text not null references workout_sessions (id) on delete cascade,
  position integer not null,
  exercise_id text not null,
  planned_exercise_id text,
  target_sets integer not null,
  rep_min integer not null,
  rep_max integer not null,
  rir_min integer not null,
  rir_max integer not null,
  rest_seconds integer not null,
  discomfort integer not null default 0 check (discomfort between 0 and 3),
  note text
);
create index session_exercises_session_idx on session_exercises (session_id, position);
create index session_exercises_history_idx on session_exercises (exercise_id);

create table workout_sets (
  id text primary key,
  session_exercise_id text not null references session_exercises (id) on delete cascade,
  set_number integer not null,
  weight_kg real not null check (weight_kg between 0 and 1000),
  reps integer not null check (reps between 0 and 100),
  rir real check (rir between 0 and 10),
  rest_seconds integer,
  completed_at text not null,
  unique (session_exercise_id, set_number)
);

create table nutrition_targets (
  id text primary key,
  effective_from text not null,
  calories integer not null check (calories between 1000 and 7000),
  protein_g integer not null,
  carbs_g integer not null,
  fat_g integer not null,
  reason text not null check (reason in ('initial', 'adjustment', 'profile_change')),
  method text not null,
  created_at text not null
);

-- Hueco para la app de fotos de comida: aquí se guardan las comidas que llegan de fuera.
-- La app no las crea por sí misma; solo las lee y las compara con el objetivo del día.
create table food_entries (
  id text primary key,
  source text not null,
  external_id text,
  eaten_at text not null,
  logged_on text not null,
  name text not null,
  calories real not null check (calories between 0 and 10000),
  protein_g real,
  carbs_g real,
  fat_g real,
  photo_uri text,
  created_at text not null,
  unique (source, external_id)
);
create index food_entries_day_idx on food_entries (logged_on);

create table weekly_checkins (
  id text primary key,
  week_start text not null unique,
  workouts_completed integer not null,
  nutrition_adherence integer not null check (nutrition_adherence between 1 and 5),
  sleep_quality integer not null check (sleep_quality between 1 and 5),
  energy integer not null check (energy between 1 and 5),
  appetite integer not null check (appetite between 1 and 5),
  performance integer not null check (performance between 1 and 5),
  pain integer not null default 0,
  pain_notes text,
  improved_exercises text,
  difficulties text,
  weight_kg real,
  report text not null,
  created_at text not null
);

create table monthly_reports (
  id text primary key,
  period_start text not null unique,
  period_end text not null,
  report text not null,
  created_at text not null
);

create table recommendations (
  id text primary key,
  source text not null check (source in ('rules', 'ai')),
  area text not null check (area in ('training', 'nutrition', 'recovery', 'tracking')),
  title text not null,
  detail text not null,
  evidence text not null default '{}',
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'dismissed', 'applied')),
  outcome text,
  created_at text not null,
  decided_at text
);

-- Las fotografías se guardan como archivos privados de la app; aquí solo la referencia.
create table progress_photos (
  id text primary key,
  taken_on text not null,
  pose text not null check (pose in ('front', 'side', 'back', 'other')),
  file_name text not null,
  width integer,
  height integer,
  created_at text not null
);

-- Estado de la app que no es un dato de entrenamiento (p. ej. el borrador del cuestionario).
create table app_state (
  key text primary key,
  value text not null
);
`,
  },
  {
    version: 2,
    name: "nutricion_snapcal",
    sql: `
-- Fusión con SnapCal: las comidas se registran en la propia app (foto, texto, código de barras o favorita).
-- «source» dice cómo se registró: foto, texto, codigo, favorita, manual (o el id de una app externa).
alter table food_entries add column fiber_g real;
alter table food_entries add column sugar_g real;
alter table food_entries add column sodium_mg real;
alter table food_entries add column calories_min real;
alter table food_entries add column calories_max real;
alter table food_entries add column notes text;
alter table food_entries add column updated_at text;

-- Alimentos de cada comida, con el origen de sus cifras (USDA, Open Food Facts, estimación de la IA o a mano).
create table food_entry_items (
  id text primary key,
  food_entry_id text not null references food_entries (id) on delete cascade,
  position integer not null,
  name text not null,
  grams real not null check (grams between 0 and 5000),
  calories real not null check (calories between 0 and 10000),
  protein_g real,
  carbs_g real,
  fat_g real,
  fiber_g real,
  sugar_g real,
  sodium_mg real,
  data_source text not null default 'ai' check (data_source in ('usda', 'off', 'ai', 'manual')),
  matched_name text,
  confidence real check (confidence between 0 and 1),
  unique (food_entry_id, position)
);
create index food_entry_items_entry_idx on food_entry_items (food_entry_id, position);

-- Comidas favoritas, para repetirlas con un toque. Los alimentos van en JSON (no se consultan por separado).
create table favorite_meals (
  id text primary key,
  name text not null,
  calories real not null check (calories between 0 and 10000),
  protein_g real,
  carbs_g real,
  fat_g real,
  fiber_g real,
  sugar_g real,
  sodium_mg real,
  items text not null default '[]',
  photo_uri text,
  created_at text not null,
  last_used_at text
);

-- Agua y pasos: un registro por día.
create table water_logs (
  logged_on text primary key,
  ml integer not null check (ml between 0 and 20000),
  updated_at text not null
);

create table step_logs (
  logged_on text primary key,
  steps integer not null check (steps between 0 and 200000),
  source text not null check (source in ('manual', 'pedometer')),
  updated_at text not null
);

-- Perfil: peso deseado (opcional) y reparto de macros (normal, bajo en hidratos o cetogénico).
alter table profiles add column target_weight_kg real check (target_weight_kg is null or target_weight_kg between 30 and 300);
alter table profiles add column macro_style text not null default 'standard' check (macro_style in ('standard', 'lowcarb', 'keto'));
`,
  },
  {
    version: 3,
    name: "objetivo_manual",
    // Objetivo de calorías y macros puesto a mano (motivo «manual»). SQLite no deja cambiar un CHECK:
    // se rehace la tabla con los mismos datos.
    sql: `
create table nutrition_targets_new (
  id text primary key,
  effective_from text not null,
  calories integer not null check (calories between 1000 and 7000),
  protein_g integer not null,
  carbs_g integer not null,
  fat_g integer not null,
  reason text not null check (reason in ('initial', 'adjustment', 'profile_change', 'manual')),
  method text not null,
  created_at text not null
);
insert into nutrition_targets_new select id, effective_from, calories, protein_g, carbs_g, fat_g, reason, method, created_at from nutrition_targets order by rowid;
drop table nutrition_targets;
alter table nutrition_targets_new rename to nutrition_targets;
`,
  },
];

/**
 * Aplica las migraciones pendientes, cada una en su propia transacción. `upTo` limita la versión
 * (solo lo usan las pruebas, para comprobar la actualización desde una base de datos antigua).
 */
export async function migrate(
  db: Queryable & { transaction: <T>(fn: (tx: Queryable) => Promise<T>) => Promise<T> },
  upTo = Number.POSITIVE_INFINITY,
): Promise<void> {
  await db.exec("create table if not exists schema_migrations (version integer primary key, name text not null, applied_at text not null)");
  const applied = new Set((await db.all<{ version: number }>("select version from schema_migrations")).map((row) => row.version));
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version) || migration.version > upTo) continue;
    await db.transaction(async (tx) => {
      await tx.exec(migration.sql);
      await tx.run("insert into schema_migrations (version, name, applied_at) values (?, ?, ?)", [
        migration.version,
        migration.name,
        new Date().toISOString(),
      ]);
    });
  }
}

/** Todas las tablas con datos del usuario, en orden de borrado seguro (hijas antes que padres). */
export const USER_TABLES = [
  "workout_sets",
  "session_exercises",
  "workout_sessions",
  "plan_exercises",
  "plan_days",
  "training_blocks",
  "recommendations",
  "monthly_reports",
  "weekly_checkins",
  "food_entry_items",
  "food_entries",
  "favorite_meals",
  "water_logs",
  "step_logs",
  "nutrition_targets",
  "progress_photos",
  "body_measurements",
  "body_weights",
  "limitations",
  "profiles",
  "app_state",
] as const;
