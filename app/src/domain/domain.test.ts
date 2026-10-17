import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isIsoDate, isoWeekday, weekStart } from "@/lib/dates";
import { change, weeklyAverages, weightTrend, type WeightEntry } from "./body/trend";
import { decideCalories, estimateNutrition, type NutritionInput } from "./nutrition/targets";
import { determineLevel, estimateOneRepMax } from "./training/level";
import { isStalled, suggestNext, workingWeight, type PastPerformance, type Target } from "./training/progression";

describe("fechas", () => {
  it("opera con fechas de calendario sin desfases", () => {
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30"); // cambio de hora en España
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-10-01", "2026-10-29")).toBe(28);
    expect(isoWeekday("2026-10-09")).toBe(5); // viernes
    expect(weekStart("2026-10-09")).toBe("2026-10-05");
    expect(weekStart("2026-10-11")).toBe("2026-10-05"); // el domingo pertenece a la semana que empezó el lunes
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-02-28")).toBe(true);
  });
});

describe("determineLevel", () => {
  const input = { structuredProgram: false, tracksLoads: false, marks: [], bodyWeightKg: 68, sex: "male" as const };

  it("clasifica por tiempo y por forma de entrenar", () => {
    expect(determineLevel({ ...input, experience: "lt6m" }).level).toBe("beginner");
    expect(determineLevel({ ...input, experience: "1to2y" }).level).toBe("beginner");
    expect(determineLevel({ ...input, experience: "1to2y", structuredProgram: true }).level).toBe("intermediate");
    expect(determineLevel({ ...input, experience: "gt4y" }).level).toBe("intermediate");
    expect(determineLevel({ ...input, experience: "gt4y", structuredProgram: true, tracksLoads: true }).level).toBe("advanced");
  });

  it("sube de nivel con marcas de fuerza claras, pero nunca baja", () => {
    const strong = determineLevel({
      ...input,
      experience: "6to12m",
      marks: [
        { lift: "bench", weightKg: 65, reps: 5 },
        { lift: "squat", weightKg: 90, reps: 5 },
      ],
    });
    expect(strong.level).toBe("intermediate");
    expect(strong.reasons.length).toBeGreaterThan(1);
    const weak = determineLevel({ ...input, experience: "2to4y", marks: [{ lift: "bench", weightKg: 30, reps: 5 }] });
    expect(weak.level).toBe("intermediate");
  });
});

describe("progresión", () => {
  const exercise = { loadStep: 2.5, bodyweight: false, perSide: false };
  const target: Target = { sets: 3, repMin: 8, repMax: 12, rirMin: 1, rirMax: 2 };
  const session = (weightKg: number, reps: number[], rir: number | null = 2, discomfort = 0): PastPerformance => ({
    date: "2026-10-01",
    discomfort,
    sets: reps.map((r) => ({ weightKg, reps: r, rir })),
  });

  it("sin historial pide calibrar", () => {
    const suggestion = suggestNext(exercise, target, []);
    expect(suggestion.kind).toBe("calibrate");
    expect(suggestion.weightKg).toBeNull();
  });

  it("sube la carga cuando todas las series llegan al tope del rango", () => {
    const suggestion = suggestNext(exercise, target, [session(40, [12, 12, 12])]);
    expect(suggestion.kind).toBe("increase");
    expect(suggestion.weightKg).toBe(42.5);
  });

  it("mantiene la carga y pide una repetición más dentro del rango", () => {
    const suggestion = suggestNext(exercise, target, [session(40, [10, 9, 8])]);
    expect(suggestion.kind).toBe("add_reps");
    expect(suggestion.weightKg).toBe(40);
    expect(suggestion.repGoal).toBe("11, 9, 8");
  });

  it("no sube si las series al tope se hicieron al fallo", () => {
    expect(suggestNext(exercise, target, [session(40, [12, 12, 12], 0)]).kind).toBe("hold");
  });

  it("baja la carga si no se llega al mínimo de repeticiones", () => {
    const suggestion = suggestNext(exercise, target, [session(50, [6, 5, 5])]);
    expect(suggestion.kind).toBe("reduce");
    expect(suggestion.weightKg).toBe(47.5);
  });

  it("nunca sube la carga si hubo dolor o mala recuperación", () => {
    expect(suggestNext(exercise, target, [session(40, [12, 12, 12], 2, 2)]).kind).toBe("pain");
    expect(suggestNext(exercise, target, [session(40, [12, 12, 12], 2, 1)]).kind).toBe("hold");
    expect(suggestNext(exercise, target, [session(40, [12, 12, 12])], { poorRecovery: true }).kind).toBe("hold");
  });

  it("con cargas ligeras exige más repeticiones antes de subir", () => {
    const light = { loadStep: 1, bodyweight: false, perSide: true };
    expect(suggestNext(light, target, [session(6, [12, 12, 12])]).kind).toBe("add_reps");
    expect(suggestNext(light, target, [session(6, [14, 14, 14])]).kind).toBe("increase");
  });

  it("detecta la carga de trabajo y el estancamiento", () => {
    expect(workingWeight([{ weightKg: 30, reps: 10, rir: null }, { weightKg: 40, reps: 8, rir: 1 }, { weightKg: 40, reps: 8, rir: 1 }])).toBe(40);
    expect(isStalled([session(40, [10, 9, 8]), session(40, [10, 9, 8]), session(40, [10, 9, 9])])).toBe(true);
    expect(isStalled([session(42.5, [9, 8, 8]), session(40, [10, 9, 8]), session(37.5, [10, 9, 9])])).toBe(false);
    expect(isStalled([session(40, [10, 9, 8])])).toBe(false);
  });

  it("estima el 1RM con Epley", () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(60, 10)).toBeCloseTo(80, 5);
  });
});

describe("tendencia de peso", () => {
  const weekly = (start: number, perWeek: number, weeks: number): WeightEntry[] =>
    Array.from({ length: weeks }, (_, i) => ({ date: addDays("2026-09-07", i * 7), kg: start + perWeek * i }));

  it("no saca conclusiones con pocos datos", () => {
    expect(weightTrend([{ date: "2026-10-05", kg: 68 }], "2026-10-09").status).toBe("insufficient");
    expect(weightTrend(weekly(68, 0.3, 2), "2026-09-14").status).toBe("insufficient");
  });

  it("calcula la pendiente semanal", () => {
    const trend = weightTrend(weekly(68, 0.3, 5), "2026-10-05");
    expect(trend.status).toBe("ok");
    if (trend.status !== "ok") return;
    expect(trend.kgPerWeek).toBeCloseTo(0.3, 5);
    expect(trend.current).toBeCloseTo(69.2, 5);
    expect(trend.pctPerWeek).toBeCloseTo((0.3 / 68.6) * 100, 3);
  });

  it("no se deja engañar por una pesada aislada", () => {
    const entries = [...weekly(68, 0, 5), { date: "2026-10-06", kg: 69.4 }];
    const trend = weightTrend(entries, "2026-10-06");
    expect(trend.status === "ok" && trend.kgPerWeek).toBeLessThan(0.25);
  });

  it("agrupa por semanas y calcula diferencias", () => {
    const weeks = weeklyAverages([
      { date: "2026-10-05", kg: 68 },
      { date: "2026-10-08", kg: 69 },
      { date: "2026-10-12", kg: 69 },
    ]);
    expect(weeks).toEqual([
      { weekStart: "2026-10-05", kg: 68.5, entries: 2 },
      { weekStart: "2026-10-12", kg: 69, entries: 1 },
    ]);
    expect(change(36, 37.8)).toEqual({ absolute: expect.closeTo(1.8, 5), percent: expect.closeTo(5, 5) });
    expect(change(null, 37)).toBeNull();
  });
});

describe("nutrición", () => {
  const input: NutritionInput = {
    sex: "male",
    ageYears: 25,
    heightCm: 180,
    weightKg: 68,
    jobActivity: "sedentary",
    dailySteps: 7000,
    trainingDays: 4,
    sessionMinutes: 60,
    goal: "muscle_gain",
    level: "beginner",
    appetite: "low",
  };

  it("estima un superávit moderado y macros coherentes", () => {
    const estimate = estimateNutrition(input);
    expect(estimate.bmr).toBe(1685);
    expect(estimate.activityFactor).toBeCloseTo(1.39, 2);
    expect(estimate.calories).toBeGreaterThan(estimate.maintenance);
    expect(estimate.calories - estimate.maintenance).toBeLessThan(400);
    expect(estimate.proteinG / input.weightKg).toBeGreaterThanOrEqual(1.6);
    expect(estimate.proteinG / input.weightKg).toBeLessThanOrEqual(2.2);
    const kcalFromMacros = estimate.proteinG * 4 + estimate.carbsG * 4 + estimate.fatG * 9;
    expect(Math.abs(kcalFromMacros - estimate.calories)).toBeLessThanOrEqual(40);
    expect(estimate.maintenanceRange[0]).toBeLessThan(estimate.maintenance);
    expect(estimate.notes.join(" ")).toContain("cuesta comer");
  });

  it("usa déficit para perder grasa", () => {
    const estimate = estimateNutrition({ ...input, goal: "fat_loss", weightKg: 90 });
    expect(estimate.adjustment).toBeLessThan(0);
    expect(estimate.proteinPerKg).toBeGreaterThan(2);
  });

  const trend = (pctPerWeek: number) =>
    ({ status: "ok", entries: 5, spanDays: 28, kgPerWeek: (pctPerWeek * 68) / 100, pctPerWeek, current: 69 }) as const;
  const context = { goal: "muscle_gain", level: "beginner", daysSinceLastChange: 30, nutritionAdherence: 4, waistVsWeight: null } as const;

  it("solo ajusta calorías con tendencia, adherencia y tiempo suficientes", () => {
    expect(decideCalories({ ...context, trend: { status: "insufficient", entries: 1, needed: "…" } }).action).toBe("wait");
    expect(decideCalories({ ...context, trend: trend(0.05) }).action).toBe("increase");
    expect(decideCalories({ ...context, trend: trend(0.05) }).deltaKcal).toBeLessThanOrEqual(150);
    expect(decideCalories({ ...context, trend: trend(0.4) }).action).toBe("keep");
    expect(decideCalories({ ...context, trend: trend(0.9) }).action).toBe("decrease");
    expect(decideCalories({ ...context, trend: trend(0.05), daysSinceLastChange: 6 }).action).toBe("wait");
    expect(decideCalories({ ...context, trend: trend(0.05), nutritionAdherence: 2 }).action).toBe("wait");
  });

  it("revisa el plan si la cintura crece de forma desproporcionada", () => {
    const decision = decideCalories({ ...context, trend: trend(0.4), waistVsWeight: { waistPct: 4, weightPct: 1.5 } });
    expect(decision.action).toBe("decrease");
  });
});
