import { json, nowIso, parseJson, type Queryable } from "@/db/types";
import type { MacroSplit } from "@/domain/nutrition/macros";
import { estimateNutrition, type NutritionEstimate, type NutritionInput } from "@/domain/nutrition/targets";
import { newId } from "@/lib/id";
import type { Profile } from "./profile";

/**
 * Objetivos nutricionales (calorías y macronutrientes) calculados con las reglas del dominio
 * (`src/domain/nutrition/targets.ts`), la única fuente del objetivo. Lo que se COME está en
 * `src/integrations/nutrition` (comidas) y se compara con este objetivo.
 */

export type NutritionTarget = {
  id: string;
  effectiveFrom: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  reason: "initial" | "adjustment" | "profile_change" | "manual";
  /**
   * Estimación de partida y, en los ajustes, la decisión que los motivó. En los puestos a mano, `manual`
   * guarda el reparto elegido (y la estimación de la que se partía).
   */
  method: NutritionEstimate & { weightKg: number; decision?: { title: string; reason: string; deltaKcal: number }; manual?: MacroSplit };
  createdAt: string;
};

export function nutritionInputFromProfile(profile: Profile, weightKg: number): NutritionInput {
  return {
    sex: profile.sex,
    ageYears: profile.ageYears,
    heightCm: profile.heightCm,
    weightKg,
    jobActivity: profile.jobActivity,
    dailySteps: profile.dailySteps,
    trainingDays: profile.daysPerWeek,
    sessionMinutes: profile.sessionMinutes,
    goal: profile.primaryGoal,
    level: profile.level,
    appetite: profile.appetite,
    macroStyle: profile.macroStyle,
  };
}

export async function insertNutritionTarget(
  db: Queryable,
  target: Pick<NutritionTarget, "calories" | "proteinG" | "carbsG" | "fatG" | "reason" | "method">,
  effectiveFrom: string,
): Promise<void> {
  await db.run(
    `insert into nutrition_targets (id, effective_from, calories, protein_g, carbs_g, fat_g, reason, method, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId(), effectiveFrom, target.calories, target.proteinG, target.carbsG, target.fatG, target.reason, json(target.method), nowIso()],
  );
}

/** Calcula el objetivo a partir del perfil y lo guarda. */
export async function createTargetFromProfile(
  db: Queryable,
  profile: Profile,
  weightKg: number,
  reason: "initial" | "profile_change",
  effectiveFrom: string,
): Promise<NutritionEstimate> {
  const estimate = estimateNutrition(nutritionInputFromProfile(profile, weightKg));
  await insertNutritionTarget(
    db,
    { calories: estimate.calories, proteinG: estimate.proteinG, carbsG: estimate.carbsG, fatG: estimate.fatG, reason, method: { ...estimate, weightKg } },
    effectiveFrom,
  );
  return estimate;
}

type TargetRow = {
  id: string;
  effective_from: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  reason: NutritionTarget["reason"];
  method: string;
  created_at: string;
};

const mapTarget = (row: TargetRow): NutritionTarget => ({
  id: row.id,
  effectiveFrom: row.effective_from,
  calories: Number(row.calories),
  proteinG: Number(row.protein_g),
  carbsG: Number(row.carbs_g),
  fatG: Number(row.fat_g),
  reason: row.reason,
  method: parseJson<NutritionTarget["method"]>(row.method, {} as NutritionTarget["method"]),
  createdAt: row.created_at,
});

/** Objetivos, del más reciente al más antiguo. */
export async function listNutritionTargets(db: Queryable): Promise<NutritionTarget[]> {
  const rows = await db.all<TargetRow>("select * from nutrition_targets order by effective_from desc, created_at desc, rowid desc");
  return rows.map(mapTarget);
}

export async function getCurrentTarget(db: Queryable): Promise<NutritionTarget | null> {
  const row = await db.get<TargetRow>("select * from nutrition_targets order by effective_from desc, created_at desc, rowid desc limit 1");
  return row ? mapTarget(row) : null;
}
