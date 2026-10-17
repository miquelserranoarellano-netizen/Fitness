import { bool, json, nowIso, parseJson, type Queryable } from "@/db/types";
import type { StrengthMark } from "@/domain/training/level";
import type {
  Allergen,
  Appetite,
  BodyArea,
  Diet,
  Equipment,
  Experience,
  Goal,
  JobActivity,
  Level,
  LimitationKind,
  MacroStyle,
  Muscle,
  SecondaryGoal,
  Severity,
  Sex,
  Stress,
  Units,
} from "@/domain/types";
import type { LimitationInput, ProfileInput } from "@/features/profile/schema";
import { today } from "@/lib/dates";
import { newId } from "@/lib/id";

export type Profile = {
  displayName: string;
  /** Edad actual: la indicada más los años transcurridos desde entonces. */
  ageYears: number;
  sex: Sex;
  heightCm: number;
  country: string;
  units: Units;
  primaryGoal: Goal;
  secondaryGoals: SecondaryGoal[];
  priorityMuscles: Muscle[];
  targetDate: string | null;
  experience: Experience;
  structuredProgram: boolean;
  tracksLoads: boolean;
  level: Level;
  previousRoutines: string;
  favoriteExercises: string[];
  dislikedExercises: string[];
  strengthMarks: StrengthMark[];
  weakMuscles: Muscle[];
  mobilityNotes: string;
  daysPerWeek: number;
  trainingWeekdays: number[];
  sessionMinutes: number;
  equipment: Equipment[];
  sleepHours: number | null;
  dailySteps: number | null;
  jobActivity: JobActivity;
  stressLevel: Stress;
  mealsPerDay: number;
  appetite: Appetite;
  dietPreference: Diet;
  allergies: Allergen[];
  intoleranceNotes: string;
  favoriteFoods: string;
  excludedFoods: string;
  weeklyFoodBudget: number | null;
  supplements: string;
  /** Reparto de macros (normal, bajo en hidratos o cetogénico). De SnapCal. */
  macroStyle: MacroStyle;
  /** Peso al que se quiere llegar (opcional). De SnapCal. */
  targetWeightKg: number | null;
  weighInWeekday: number;
  remindersEnabled: boolean;
  photosConsent: boolean;
  onboardingCompleted: boolean;
};

type Row = Record<string, unknown>;

/** Años cumplidos entre dos fechas `AAAA-MM-DD`. */
export function yearsBetween(from: string, to: string): number {
  const [y1 = 0, m1 = 1, d1 = 1] = from.split("-").map(Number);
  const [y2 = 0, m2 = 1, d2 = 1] = to.split("-").map(Number);
  let years = y2 - y1;
  if (m2 < m1 || (m2 === m1 && d2 < d1)) years -= 1;
  return Math.max(0, years);
}

function mapProfile(row: Row): Profile {
  const s = (key: string) => (row[key] as string | null) ?? "";
  const list = <T>(key: string) => parseJson<T[]>(row[key], []);
  const num = (key: string) => (row[key] === null || row[key] === undefined ? null : Number(row[key]));
  return {
    displayName: s("display_name"),
    ageYears: Number(row.age_years) + yearsBetween(String(row.age_recorded_on), today()),
    sex: row.sex as Sex,
    heightCm: Number(row.height_cm),
    country: s("country"),
    units: row.units as Units,
    primaryGoal: row.primary_goal as Goal,
    secondaryGoals: list<SecondaryGoal>("secondary_goals"),
    priorityMuscles: list<Muscle>("priority_muscles"),
    targetDate: (row.target_date as string | null) ?? null,
    experience: row.training_experience as Experience,
    structuredProgram: Boolean(row.structured_program),
    tracksLoads: Boolean(row.tracks_loads),
    level: row.experience_level as Level,
    previousRoutines: s("previous_routines"),
    favoriteExercises: list<string>("favorite_exercises"),
    dislikedExercises: list<string>("disliked_exercises"),
    strengthMarks: list<StrengthMark>("strength_marks"),
    weakMuscles: list<Muscle>("weak_muscles"),
    mobilityNotes: s("mobility_notes"),
    daysPerWeek: Number(row.days_per_week),
    trainingWeekdays: list<number>("training_weekdays"),
    sessionMinutes: Number(row.session_minutes),
    equipment: list<Equipment>("equipment"),
    sleepHours: num("sleep_hours"),
    dailySteps: num("daily_steps"),
    jobActivity: row.job_activity as JobActivity,
    stressLevel: row.stress_level as Stress,
    mealsPerDay: Number(row.meals_per_day),
    appetite: row.appetite as Appetite,
    dietPreference: row.diet_preference as Diet,
    allergies: list<Allergen>("allergies"),
    intoleranceNotes: s("intolerance_notes"),
    favoriteFoods: s("favorite_foods"),
    excludedFoods: s("excluded_foods"),
    weeklyFoodBudget: num("weekly_food_budget"),
    supplements: s("supplements"),
    macroStyle: (row.macro_style as MacroStyle | undefined) ?? "standard",
    targetWeightKg: num("target_weight_kg"),
    weighInWeekday: Number(row.weigh_in_weekday),
    remindersEnabled: Boolean(row.reminders_enabled),
    photosConsent: row.photos_consent_at !== null && row.photos_consent_at !== undefined,
    onboardingCompleted: row.onboarding_completed_at !== null && row.onboarding_completed_at !== undefined,
  };
}

export async function getProfile(db: Queryable): Promise<Profile | null> {
  const row = await db.get<Row>("select * from profiles where id = 1");
  return row ? mapProfile(row) : null;
}

export async function requireProfile(db: Queryable): Promise<Profile> {
  const profile = await getProfile(db);
  if (!profile) throw new Error("Todavía no hay perfil.");
  return profile;
}

export async function isOnboarded(db: Queryable): Promise<boolean> {
  const row = await db.get<{ done: number }>("select count(*) as done from profiles where id = 1 and onboarding_completed_at is not null");
  return (row?.done ?? 0) > 0;
}

/** Crea o actualiza el perfil. `level` se calcula fuera (reglas de `domain/training/level`). */
export async function upsertProfile(db: Queryable, input: ProfileInput, level: Level): Promise<void> {
  const now = nowIso();
  const values = {
    display_name: input.displayName,
    age_years: input.ageYears,
    age_recorded_on: today(),
    sex: input.sex,
    height_cm: input.heightCm,
    country: input.country || null,
    units: input.units,
    primary_goal: input.primaryGoal,
    secondary_goals: json(input.secondaryGoals),
    priority_muscles: json(input.priorityMuscles),
    target_date: input.targetDate,
    training_experience: input.experience,
    structured_program: bool(input.structuredProgram),
    tracks_loads: bool(input.tracksLoads),
    experience_level: level,
    previous_routines: input.previousRoutines || null,
    favorite_exercises: json(input.favoriteExercises),
    disliked_exercises: json(input.dislikedExercises),
    strength_marks: json(input.strengthMarks),
    weak_muscles: json(input.weakMuscles),
    mobility_notes: input.mobilityNotes || null,
    days_per_week: input.daysPerWeek,
    training_weekdays: json([...new Set(input.trainingWeekdays)].sort((a, b) => a - b)),
    session_minutes: input.sessionMinutes,
    equipment: json(input.equipment),
    sleep_hours: input.sleepHours,
    daily_steps: input.dailySteps,
    job_activity: input.jobActivity,
    stress_level: input.stressLevel,
    meals_per_day: input.mealsPerDay,
    appetite: input.appetite,
    diet_preference: input.dietPreference,
    allergies: json(input.allergies),
    intolerance_notes: input.intoleranceNotes || null,
    favorite_foods: input.favoriteFoods || null,
    excluded_foods: input.excludedFoods || null,
    weekly_food_budget: input.weeklyFoodBudget,
    supplements: input.supplements || null,
  };
  const columns = Object.keys(values);
  const params = Object.values(values) as (string | number | null)[];
  await db.run(
    `insert into profiles (id, ${columns.join(", ")}, created_at, updated_at)
     values (1, ${columns.map(() => "?").join(", ")}, ?, ?)
     on conflict (id) do update set ${columns.map((column) => `${column} = excluded.${column}`).join(", ")}, updated_at = excluded.updated_at`,
    [...params, now, now],
  );
}

export async function markOnboarded(db: Queryable): Promise<void> {
  const now = nowIso();
  await db.run("update profiles set onboarding_completed_at = ?, health_consent_at = coalesce(health_consent_at, ?) where id = 1", [now, now]);
}

export async function updateReminders(db: Queryable, weighInWeekday: number, enabled: boolean): Promise<void> {
  await db.run("update profiles set weigh_in_weekday = ?, reminders_enabled = ?, updated_at = ? where id = 1", [weighInWeekday, bool(enabled), nowIso()]);
}

/** Reparto de macros y peso deseado. Valida `services.updateNutritionPreferences`. */
export async function setNutritionPreferences(db: Queryable, input: { macroStyle: MacroStyle; targetWeightKg: number | null }): Promise<void> {
  await db.run("update profiles set macro_style = ?, target_weight_kg = ?, updated_at = ? where id = 1", [input.macroStyle, input.targetWeightKg, nowIso()]);
}

export async function setPhotosConsent(db: Queryable, granted: boolean): Promise<void> {
  await db.run("update profiles set photos_consent_at = ?, updated_at = ? where id = 1", [granted ? nowIso() : null, nowIso()]);
}

/* ───────────────────────────── Limitaciones ───────────────────────────── */

export type Limitation = {
  id: string;
  kind: LimitationKind;
  bodyArea: BodyArea;
  severity: Severity;
  description: string;
  active: boolean;
  createdOn: string;
};

export async function getLimitations(db: Queryable): Promise<Limitation[]> {
  const rows = await db.all<{
    id: string;
    kind: LimitationKind;
    body_area: BodyArea;
    severity: Severity;
    description: string | null;
    active: number;
    created_at: string;
  }>("select id, kind, body_area, severity, description, active, created_at from limitations order by active desc, created_at desc");
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    bodyArea: row.body_area,
    severity: row.severity,
    description: row.description ?? "",
    active: Boolean(row.active),
    createdOn: row.created_at.slice(0, 10),
  }));
}

export async function insertLimitation(db: Queryable, input: LimitationInput): Promise<void> {
  await db.run("insert into limitations (id, kind, body_area, severity, description, created_at) values (?, ?, ?, ?, ?, ?)", [
    newId(),
    input.kind,
    input.bodyArea,
    input.severity,
    input.description || null,
    nowIso(),
  ]);
}

export async function resolveLimitation(db: Queryable, id: string): Promise<void> {
  await db.run("update limitations set active = 0, resolved_at = ? where id = ?", [nowIso(), id]);
}

/* ───────────────────────────── Estado de la app ───────────────────────────── */

export async function getState<T>(db: Queryable, key: string): Promise<T | null> {
  const row = await db.get<{ value: string }>("select value from app_state where key = ?", [key]);
  return row ? parseJson<T | null>(row.value, null) : null;
}

export async function setState(db: Queryable, key: string, value: unknown): Promise<void> {
  await db.run("insert into app_state (key, value) values (?, ?) on conflict (key) do update set value = excluded.value", [key, json(value)]);
}

export async function clearState(db: Queryable, key: string): Promise<void> {
  await db.run("delete from app_state where key = ?", [key]);
}
