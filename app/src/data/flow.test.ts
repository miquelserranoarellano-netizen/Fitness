import { beforeEach, describe, expect, it } from "vitest";
import { openTestDb } from "@/db/node";
import type { Db } from "@/db/types";
import { getDayIntake, saveFoodEntries } from "@/integrations/nutrition/store";
import { addDays, today, weekStart } from "@/lib/dates";
import { getActiveBlock, listBlocks } from "./blocks";
import { listMeasurements, listWeights } from "./body";
import { coachTip, dueTasks } from "./coach";
import { exportAllData } from "./export";
import { getInsights } from "./insights";
import { getCurrentTarget, listNutritionTargets } from "./nutrition";
import { getLimitations, getProfile, isOnboarded } from "./profile";
import { getCheckin, listRecommendations } from "./reviews";
import {
  addLimitation,
  applyCalorieDecision,
  completeOnboarding,
  deleteAllData,
  generateMonthlyReport,
  logWeight,
  recalculateTarget,
  regeneratePlan,
  saveMeasurements,
  startNextBlock,
  submitCheckin,
  updateProfile,
} from "./services";
import {
  deleteSet,
  finishSession,
  getExerciseLogs,
  getOpenSession,
  getSession,
  listCompletedSessions,
  logSet,
  startSession,
  swapExercise,
  updateSessionExercise,
} from "./sessions";
import { measurements, onboardingInput } from "./testing";

let db: Db;

beforeEach(async () => {
  db = await openTestDb();
});

describe("cuestionario inicial", () => {
  it("guarda el perfil, el peso, las medidas, el primer bloque y el objetivo nutricional", async () => {
    expect(await isOnboarded(db)).toBe(false);
    const result = await completeOnboarding(db, onboardingInput());
    expect(result).toEqual({ ok: true, data: undefined });

    expect(await isOnboarded(db)).toBe(true);
    const profile = await getProfile(db);
    expect(profile?.level).toBe("beginner");
    expect(profile?.ageYears).toBe(25);
    expect(profile?.priorityMuscles).toContain("biceps");

    const block = await getActiveBlock(db);
    expect(block?.number).toBe(1);
    expect(block?.split).toBe("upper_lower_arms_5");
    expect(block?.days).toHaveLength(5);
    expect(block?.days.every((day) => day.exercises.length >= 3)).toBe(true);
    expect(block?.rationale.levelReasons.length).toBeGreaterThan(0);

    expect((await listWeights(db)).map((entry) => entry.kg)).toEqual([68]);
    expect((await listMeasurements(db))[0]?.values.arm_flexed).toBe(31);
    expect(await getLimitations(db)).toHaveLength(1);

    const target = await getCurrentTarget(db);
    expect(target?.reason).toBe("initial");
    expect(target?.calories).toBeGreaterThan(2300);
    expect(target?.calories).toBeLessThan(3200);
    expect(target?.proteinG).toBe(120);
  });

  it("rechaza datos no válidos y no se puede completar dos veces", async () => {
    const bad = await completeOnboarding(db, { ...onboardingInput(), ageYears: 12 });
    expect(bad.ok).toBe(false);
    expect(await isOnboarded(db)).toBe(false);

    const days = await completeOnboarding(db, { ...onboardingInput(), trainingWeekdays: [1, 2] });
    expect(days).toEqual({ ok: false, error: "Marca exactamente 5 días de entrenamiento o no marques ninguno." });

    expect((await completeOnboarding(db, onboardingInput())).ok).toBe(true);
    await expect(completeOnboarding(db, onboardingInput())).rejects.toThrow("ya estaba completado");
    expect(await listBlocks(db)).toHaveLength(1);
  });
});

describe("modo entrenamiento", () => {
  beforeEach(async () => {
    await completeOnboarding(db, onboardingInput());
  });

  it("registra una sesión completa y la usa como historial", async () => {
    const block = (await getActiveBlock(db))!;
    const day = block.days[0]!;
    const sessionId = await startSession(db, day.id);
    // Solo puede haber una sesión abierta.
    expect(await startSession(db, block.days[1]!.id)).toBe(sessionId);
    expect((await getOpenSession(db))?.id).toBe(sessionId);

    const session = (await getSession(db, sessionId))!;
    expect(session.exercises).toHaveLength(day.exercises.length);
    const [first, second] = session.exercises;

    // Sin series no se puede terminar.
    expect(await finishSession(db, sessionId, { energy: 4, notes: null })).toBe(false);

    // Cambiar de ejercicio solo antes de registrar series.
    const alternative = first!.exerciseId === "machine_chest_press" ? "dumbbell_bench_press" : null;
    const saved = await logSet(db, { sessionExerciseId: first!.id, setNumber: 1, weightKg: 40, reps: 10, rir: 2, restSeconds: null });
    expect(saved?.weightKg).toBe(40);
    expect(await swapExercise(db, first!.id, alternative ?? "dumbbell_bench_press")).toBe(false);

    // Corregir una serie la sobrescribe.
    const corrected = await logSet(db, { sessionExerciseId: first!.id, setNumber: 1, weightKg: 42.5, reps: 9, rir: 1, restSeconds: null });
    expect(corrected?.weightKg).toBe(42.5);
    const extra = await logSet(db, { sessionExerciseId: first!.id, setNumber: 2, weightKg: 42.5, reps: 8, rir: 1, restSeconds: 150 });
    expect(await deleteSet(db, extra!.id)).toBe(true);

    expect(await updateSessionExercise(db, second!.id, { discomfort: 1, note: "Algo de tensión" })).toBe(true);
    await logSet(db, { sessionExerciseId: second!.id, setNumber: 1, weightKg: 30, reps: 12, rir: 2, restSeconds: null });

    expect(await finishSession(db, sessionId, { energy: 4, notes: "Buena sesión" })).toBe(true);
    expect(await getOpenSession(db)).toBeNull();
    // Una sesión terminada ya no admite series.
    expect(await logSet(db, { sessionExerciseId: first!.id, setNumber: 3, weightKg: 40, reps: 10, rir: 2, restSeconds: null })).toBeNull();

    const sessions = await listCompletedSessions(db);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ sets: 2, exercises: 2, volumeKg: Math.round(42.5 * 9 + 30 * 12), energy: 4, discomfort: 1, date: today() });

    const logs = await getExerciseLogs(db, { exerciseIds: [first!.exerciseId] });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.sets).toEqual([{ weightKg: 42.5, reps: 9, rir: 1 }]);

    // La siguiente sesión de la rotación es el día 2.
    const insights = await getInsights(db);
    expect(insights.training.nextDay?.id).toBe(block.days[1]!.id);
    expect(insights.training.trainedToday).toBe(true);
  });

  it("permite sustituir un ejercicio por una alternativa antes de registrar series", async () => {
    const block = (await getActiveBlock(db))!;
    const sessionId = await startSession(db, block.days[0]!.id);
    const session = (await getSession(db, sessionId))!;
    const target = session.exercises[0]!;
    const { getExercise } = await import("@/domain/exercises");
    const alternative = getExercise(target.exerciseId)!.alternatives.find((id) => !session.exercises.some((item) => item.exerciseId === id))!;
    expect(await swapExercise(db, target.id, alternative)).toBe(true);
    const updated = (await getSession(db, sessionId))!;
    expect(updated.exercises[0]).toMatchObject({ exerciseId: alternative, plannedExerciseId: target.exerciseId });
    // No se puede repetir un ejercicio que ya está en la sesión.
    expect(await swapExercise(db, updated.exercises[1]!.id, alternative)).toBe(false);
  });

  it("no deja regenerar la rutina con una sesión abierta", async () => {
    const block = (await getActiveBlock(db))!;
    await startSession(db, block.days[0]!.id);
    expect(await regeneratePlan(db)).toEqual({ ok: false, error: "Tienes una sesión en curso. Termínala o descártala antes de cambiar de rutina." });
  });
});

describe("cuerpo, perfil y nutrición", () => {
  beforeEach(async () => {
    await completeOnboarding(db, onboardingInput());
  });

  it("valida pesos y medidas", async () => {
    expect((await logWeight(db, { date: addDays(today(), 1), kg: 70 })).ok).toBe(false);
    expect((await logWeight(db, { date: today(), kg: 20 })).ok).toBe(false);
    expect((await logWeight(db, { date: addDays(today(), -7), kg: 67.4 })).ok).toBe(true);
    expect((await listWeights(db)).map((entry) => entry.kg)).toEqual([67.4, 68]);

    expect((await saveMeasurements(db, today(), measurements())).ok).toBe(false);
    expect((await saveMeasurements(db, today(), measurements({ waist: 300 }))).ok).toBe(false);
    expect((await saveMeasurements(db, today(), measurements({ waist: 77 }))).ok).toBe(true);
  });

  it("guarda el perfil y avisa de si afecta al plan o a la nutrición", async () => {
    const profile = (await getProfile(db))!;
    const unchanged = await updateProfile(db, { ...onboardingInput(), weightKg: undefined, measurements: undefined, limitations: undefined, displayName: "Miki" });
    expect(unchanged).toEqual({ ok: true, data: { planAffected: false, nutritionAffected: false } });
    expect((await getProfile(db))?.displayName).toBe("Miki");

    const changed = await updateProfile(db, { ...onboardingInput(), daysPerWeek: 4 });
    expect(changed).toEqual({ ok: true, data: { planAffected: true, nutritionAffected: true } });
    expect(profile.daysPerWeek).toBe(5);

    expect((await regeneratePlan(db)).ok).toBe(true);
    const blocks = await listBlocks(db);
    expect(blocks.map((block) => [block.number, block.status])).toEqual([
      [2, "active"],
      [1, "completed"],
    ]);
    expect((await getActiveBlock(db))?.days).toHaveLength(4);
  });

  it("añade limitaciones y recalcula el objetivo nutricional", async () => {
    expect((await addLimitation(db, { kind: "injury", bodyArea: "knee", severity: "moderate", description: "" })).ok).toBe(true);
    expect(await getLimitations(db)).toHaveLength(2);

    const recalculated = await recalculateTarget(db);
    expect(recalculated.ok).toBe(true);
    expect(await listNutritionTargets(db)).toHaveLength(2);

    // Sin tendencia de peso no hay ajuste que aplicar.
    expect(await applyCalorieDecision(db)).toEqual({ ok: false, error: "Ahora mismo no hay ningún ajuste justificado por tus datos." });
  });

  it("guarda las comidas que llegan de la app de fotos sin duplicarlas", async () => {
    const date = today();
    const result = await saveFoodEntries(db, "app-fotos", [
      { externalId: "a1", eatenAt: new Date().toISOString(), date, name: "Arroz con pollo", calories: 650, proteinG: 45, carbsG: 80, fatG: 12 },
      { externalId: "a2", eatenAt: new Date().toISOString(), date, name: "Yogur", calories: 120 },
      { externalId: "", eatenAt: "ayer", name: "", calories: -5 },
    ]);
    expect(result.saved).toBe(2);
    expect(result.rejected).toHaveLength(1);

    // Reenviar la misma comida la actualiza en lugar de duplicarla.
    await saveFoodEntries(db, "app-fotos", [{ externalId: "a1", eatenAt: new Date().toISOString(), date, name: "Arroz con pollo", calories: 700, proteinG: 45 }]);
    const intake = await getDayIntake(db, date);
    expect(intake.entries).toHaveLength(2);
    expect(intake.calories).toBe(820);
    expect(intake.proteinG).toBe(45);
    expect(intake.carbsG).toBeNull();
  });
});

describe("revisiones y bloques", () => {
  beforeEach(async () => {
    await completeOnboarding(db, onboardingInput());
  });

  it("hace la revisión semanal y guarda las recomendaciones", async () => {
    const week = weekStart(today());
    const missing = await submitCheckin(db, {
      weekStart: week,
      workoutsCompleted: 2,
      nutritionAdherence: 0,
      sleepQuality: 2,
      energy: 2,
      appetite: 3,
      performance: 3,
      pain: false,
      painNotes: "",
      improvedExercises: "",
      difficulties: "",
      weightKg: null,
    });
    expect(missing.ok).toBe(false);

    const result = await submitCheckin(db, {
      weekStart: week,
      workoutsCompleted: 2,
      nutritionAdherence: 2,
      sleepQuality: 2,
      energy: 2,
      appetite: 3,
      performance: 3,
      pain: true,
      painNotes: "Hombro",
      improvedExercises: "",
      difficulties: "Dormir",
      weightKg: 68.4,
    });
    expect(result).toEqual({ ok: true, data: { weekStart: week } });

    const checkin = (await getCheckin(db, week))!;
    expect(checkin.report.summary.length).toBeGreaterThan(0);
    expect(checkin.report.changes.map((change) => change.area)).toContain("recovery");
    const recommendations = await listRecommendations(db);
    expect(recommendations.length).toBe(checkin.report.changes.length);
    expect(recommendations.every((item) => item.status === "proposed")).toBe(true);

    // La recuperación mala se refleja en el consejo del día.
    const insights = await getInsights(db);
    expect(insights.poorRecovery).toBe(true);
    expect(coachTip(insights).title).toBeTruthy();
    expect(dueTasks(insights).some((task) => task.id === "weekly_review")).toBe(false);
  });

  it("evalúa el bloque y genera el siguiente solo con datos suficientes", async () => {
    expect(await startNextBlock(db)).toEqual({ ok: false, error: "El bloque lleva menos de dos semanas: todavía no hay datos suficientes para evaluarlo." });
    expect((await generateMonthlyReport(db)).ok).toBe(false);

    // Simula que el bloque y los datos empezaron hace 30 días.
    const past = addDays(today(), -30);
    await db.run("update training_blocks set started_on = ?", [past]);
    await db.run("update body_weights set measured_on = ?", [past]);
    await db.run("update body_measurements set measured_on = ?", [past]);
    await logWeight(db, { date: addDays(today(), -15), kg: 68.6 });
    await logWeight(db, { date: today(), kg: 69.1 });

    const monthly = await generateMonthlyReport(db);
    expect(monthly.ok).toBe(true);

    expect(await startNextBlock(db)).toEqual({ ok: true, data: undefined });
    const blocks = await listBlocks(db);
    expect(blocks[0]).toMatchObject({ number: 2, status: "active" });
    expect(blocks[1]?.evaluation?.summary[0]).toContain("0 de");
    expect((await getActiveBlock(db))?.rationale.changes?.length).toBeGreaterThan(0);
  });
});

describe("exportar y borrar", () => {
  it("exporta todas las tablas y borra todo", async () => {
    await completeOnboarding(db, onboardingInput());
    const data = await exportAllData(db);
    expect(data.formato).toBe("appcombinada/exportacion@2");
    const profiles = data.profiles as { priority_muscles: string[] }[];
    expect(profiles[0]?.priority_muscles).toContain("biceps");
    expect((data.training_blocks as unknown[]).length).toBe(1);
    expect(Array.isArray(data.food_entries)).toBe(true);

    await deleteAllData(db);
    expect(await getProfile(db)).toBeNull();
    expect(await listBlocks(db)).toHaveLength(0);
    expect(await isOnboarded(db)).toBe(false);
  });
});
