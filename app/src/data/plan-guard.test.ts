import { beforeEach, describe, expect, it } from "vitest";
import { openTestDb } from "@/db/node";
import type { Db } from "@/db/types";
import { estimateNutrition } from "@/domain/nutrition/targets";
import { getActiveBlock, listBlocks } from "./blocks";
import { getProfile, isOnboarded } from "./profile";
import { completeOnboarding, regeneratePlan, updateProfile } from "./services";
import { onboardingInput } from "./testing";

/**
 * Fallos que sacaron las pruebas con perfiles al azar (`domain/random.test.ts`): rutinas con días sin
 * ejercicios y macros que no cuadraban con mucho peso.
 */

let db: Db;

beforeEach(async () => {
  db = await openTestDb();
});

describe("rutinas que no se pueden entrenar", () => {
  it("el cuestionario no guarda nada si con ese material hay días sin ejercicios, y dice qué cambiar", async () => {
    const result = await completeOnboarding(db, { ...onboardingInput(), equipment: ["bench"], limitations: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("sin ningún ejercicio");
      expect(result.error).toContain("marca más material");
      expect(result.error).not.toContain("lesiones");
    }
    // Todo o nada: ni perfil, ni peso, ni bloque.
    expect(await isOnboarded(db)).toBe(false);
    expect(await getProfile(db)).toBeNull();
    expect(await listBlocks(db)).toHaveLength(0);

    // Con material suficiente, el mismo cuestionario sale bien.
    expect((await completeOnboarding(db, { ...onboardingInput(), equipment: ["dumbbells", "bench"], limitations: [] })).ok).toBe(true);
    expect((await getActiveBlock(db))?.days.every((day) => day.exercises.length > 0)).toBe(true);
  });

  it("al regenerar con un perfil que ya no da rutina, se conserva la que había", async () => {
    await completeOnboarding(db, onboardingInput());
    const before = await getActiveBlock(db);
    const profile = await getProfile(db);
    expect((await updateProfile(db, { ...onboardingInput(), equipment: ["pullup_bar"], weightKg: undefined, measurements: undefined, limitations: undefined })).ok).toBe(true);

    const result = await regeneratePlan(db);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("revisa tus lesiones y limitaciones");
    const after = await getActiveBlock(db);
    expect(after?.id).toBe(before?.id);
    expect(await listBlocks(db)).toHaveLength(1);
    expect(profile?.equipment).toHaveLength(6);
  });
});

describe("macros con mucho peso", () => {
  const base = { sex: "male", ageYears: 35, heightCm: 178, jobActivity: "sedentary", dailySteps: 5000, trainingDays: 3, sessionMinutes: 60, level: "beginner", appetite: "normal" } as const;

  it("por debajo de un IMC de 30 no cambia nada: proteína y grasa por kilo de peso real", () => {
    const estimate = estimateNutrition({ ...base, weightKg: 80, goal: "fat_loss" });
    expect(estimate.proteinG).toBe(170); // 80 kg × 2,1 g
    expect(estimate.notes.join(" ")).not.toContain("peso de referencia");
  });

  it("por encima se usa el peso de referencia y los macros suman las calorías", () => {
    for (const weightKg of [100, 130, 160, 200]) {
      const estimate = estimateNutrition({ ...base, weightKg, goal: "fat_loss" });
      // 178 cm → 95 kg de referencia → 2,1 g/kg ≈ 200 g, pese lo que pese.
      expect(estimate.proteinG, `${weightKg} kg`).toBe(200);
      expect(estimate.carbsG, `${weightKg} kg`).toBeGreaterThan(100);
      const fromMacros = estimate.proteinG * 4 + estimate.carbsG * 4 + estimate.fatG * 9;
      expect(Math.abs(fromMacros - estimate.calories), `${weightKg} kg`).toBeLessThanOrEqual(45);
      expect(estimate.notes.join(" "), `${weightKg} kg`).toContain("peso de referencia de 95 kg");
    }
  });
});
