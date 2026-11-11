import { describe, expect, it } from "vitest";
import { dayStatus, dayTotals, firstLogDate, goalOn, loggingStreak, mealTotals, periodSummary, rolloverExtra, scaleItem, totalsByDate, weeklyIntake, type LoggedMeal } from "./intake";
import { checkManualTarget, gramsFromSplit, splitFromGrams } from "./macros";
import { calorieFloor, decideCalories, estimateNutrition, type NutritionInput } from "./targets";

const base: NutritionInput = {
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
  appetite: "normal",
};

const kcalOf = (estimate: { proteinG: number; carbsG: number; fatG: number }) => estimate.proteinG * 4 + estimate.carbsG * 4 + estimate.fatG * 9;

describe("objetivo nutricional: aportaciones de SnapCal", () => {
  it("nunca propone menos del mínimo de seguridad", () => {
    expect(calorieFloor("male")).toBe(1500);
    expect(calorieFloor("female")).toBe(1200);
    expect(calorieFloor("unspecified")).toBe(1350);

    const small: NutritionInput = { ...base, sex: "female", ageYears: 60, heightCm: 148, weightKg: 42, trainingDays: 2, sessionMinutes: 30, dailySteps: null, goal: "fat_loss" };
    const estimate = estimateNutrition(small);
    expect(estimate.calories).toBe(1200);
    expect(estimate.limitedToFloor).toBe(true);
    expect(estimate.notes.join(" ")).toContain("mínimo de seguridad");
    // El déficit mostrado es el real tras aplicar el mínimo.
    expect(estimate.calories - estimate.maintenance).toBe(estimate.adjustment);

    expect(estimateNutrition(base).limitedToFloor).toBe(false);
  });

  it("los repartos bajo en hidratos y cetogénico cambian los macros, no las calorías ni la proteína", () => {
    const standard = estimateNutrition(base);
    const lowcarb = estimateNutrition({ ...base, macroStyle: "lowcarb" });
    const keto = estimateNutrition({ ...base, macroStyle: "keto" });

    for (const estimate of [standard, lowcarb, keto]) {
      expect(Math.abs(kcalOf(estimate) - estimate.calories)).toBeLessThanOrEqual(40);
    }
    expect(lowcarb.calories).toBe(standard.calories);
    expect(keto.proteinG).toBe(standard.proteinG);
    expect(lowcarb.carbsG).toBeLessThan(standard.carbsG);
    expect(keto.carbsG).toBeLessThan(lowcarb.carbsG);
    expect((keto.carbsG * 4) / keto.calories).toBeLessThanOrEqual(0.06);
    expect(keto.fatG).toBeGreaterThan(standard.fatG);
    expect(keto.macroStyle).toBe("keto");
    expect(standard.macroStyle).toBe("standard");
  });

  it("no propone recortar calorías por debajo del mínimo", () => {
    const trend = { status: "ok", entries: 5, spanDays: 28, kgPerWeek: -0.1, pctPerWeek: -0.2, current: 60 } as const;
    const context = { trend, goal: "fat_loss", level: "beginner", daysSinceLastChange: 30, nutritionAdherence: 4, waistVsWeight: null } as const;
    // Pierde más despacio de lo buscado: se propondría bajar 125 kcal…
    expect(decideCalories(context).action).toBe("decrease");
    expect(decideCalories({ ...context, currentCalories: 1700, sex: "female" }).action).toBe("decrease");
    // …salvo que eso deje el objetivo por debajo del mínimo.
    const blocked = decideCalories({ ...context, currentCalories: 1250, sex: "female" });
    expect(blocked.action).toBe("keep");
    expect(blocked.reason).toContain("1200 kcal");
  });
});

describe("alimentos de una comida", () => {
  const rice = { name: "Arroz", grams: 200, calories: 260, proteinG: 5, carbsG: 57, fatG: 1, fiberG: 0.8, sugarG: null, sodiumMg: 2 };

  it("recalcula las cifras al cambiar los gramos, desde el valor original", () => {
    const half = scaleItem(rice, 100);
    expect(half).toMatchObject({ name: "Arroz", grams: 100, calories: 130, proteinG: 3, carbsG: 29, fatG: 1, fiberG: 0.4, sugarG: null, sodiumMg: 1 });
    expect(scaleItem(rice, 0).calories).toBe(0);
    expect(scaleItem(rice, -5).grams).toBe(0);
  });

  it("suma la comida sin inventar los datos que faltan", () => {
    const chicken = { name: "Pollo", grams: 150, calories: 248, proteinG: 46, carbsG: 0, fatG: 5, fiberG: null, sugarG: null, sodiumMg: null };
    const totals = mealTotals([rice, chicken]);
    expect(totals).toEqual({ calories: 508, proteinG: 51, carbsG: 57, fatG: 6, fiberG: 0.8, sugarG: null, sodiumMg: 2 });
    expect(mealTotals([])).toEqual({ calories: 0, proteinG: null, carbsG: null, fatG: null, fiberG: null, sugarG: null, sodiumMg: null });
  });
});

describe("lo comido por días y semanas", () => {
  const meal = (date: string, calories: number, proteinG: number | null = null): LoggedMeal => ({ date, calories, proteinG, carbsG: null, fatG: null });
  const today = "2026-10-17";

  it("suma por día y distingue «sin dato» de cero", () => {
    expect(dayTotals([meal(today, 500, 30), meal(today, 300)])).toMatchObject({ calories: 800, proteinG: 30, carbsG: null, count: 2 });
    const byDate = totalsByDate([meal("2026-10-15", 1000), meal(today, 500), meal(today, 700)]);
    expect(Object.keys(byDate).sort()).toEqual(["2026-10-15", today]);
    expect(byDate[today]?.calories).toBe(1200);
    expect(firstLogDate(byDate)).toBe("2026-10-15");
  });

  it("marca cada día como cumplido (90-105 %), fallado o sin valorar", () => {
    const byDate = totalsByDate([meal("2026-10-13", 1800), meal("2026-10-14", 2100), meal("2026-10-15", 2150), meal("2026-10-16", 1700)]);
    const context = (date: string) => ({ date, today, start: "2026-10-13" });
    expect(dayStatus(byDate["2026-10-13"], 2000, context("2026-10-13"))).toBe("good"); // 90 % justo
    expect(dayStatus(byDate["2026-10-14"], 2000, context("2026-10-14"))).toBe("good"); // 105 % justo
    expect(dayStatus(byDate["2026-10-15"], 2000, context("2026-10-15"))).toBe("bad"); // +7,5 %
    expect(dayStatus(byDate["2026-10-16"], 2000, context("2026-10-16"))).toBe("bad"); // 85 %, día terminado
    expect(dayStatus(undefined, 2000, context(today))).toBe("none"); // hoy aún sin registrar
    expect(dayStatus(undefined, 2000, { date: "2026-10-12", today, start: "2026-10-13" })).toBe("none"); // antes del primer registro
    expect(dayStatus(undefined, 2000, { date: "2026-10-15", today, start: "2026-10-14" })).toBe("bad"); // sin registro tras empezar
    expect(dayStatus(byDate["2026-10-16"], 2000, { date: "2026-10-18", today, start: null })).toBe("none"); // futuro
    // Hoy: quedarse corto no es fallar (el día no ha terminado); llegar al margen es cumplir; pasarse es fallar.
    const day = (calories: number) => totalsByDate([meal(today, calories)])[today];
    expect(dayStatus(day(400), 2000, context(today))).toBe("none");
    expect(dayStatus(day(1900), 2000, context(today))).toBe("good");
    expect(dayStatus(day(2200), 2000, context(today))).toBe("bad");
  });

  it("usa el objetivo vigente en cada fecha y resume el periodo", () => {
    const targets = [
      { effectiveFrom: "2026-10-10", calories: 2000 },
      { effectiveFrom: "2026-10-20", calories: 2200 },
    ];
    expect(goalOn(targets, "2026-10-05")).toBe(2000); // antes del primero: el primero
    expect(goalOn(targets, "2026-10-19")).toBe(2000);
    expect(goalOn(targets, "2026-10-20")).toBe(2200);
    expect(goalOn([], "2026-10-20")).toBeNull();
    expect(
      periodSummary([
        { status: "good", calories: 2000, count: 3 },
        { status: "bad", calories: 2600, count: 4 },
        { status: "bad", calories: 0, count: 0 },
        { status: "none", calories: 0, count: 0 },
      ]),
    ).toEqual({ good: 1, bad: 2, logged: 2, averageCalories: 2300 });
  });

  it("cuenta la racha y las calorías sobrantes", () => {
    const byDate = totalsByDate([meal("2026-10-14", 1800), meal("2026-10-15", 1900), meal("2026-10-16", 1950)]);
    expect(loggingStreak(byDate, today)).toBe(3); // hoy aún sin nada: cuenta desde ayer
    expect(loggingStreak(totalsByDate([meal(today, 300)]), today)).toBe(1);
    expect(loggingStreak({}, today)).toBe(0);

    expect(rolloverExtra(byDate, today, 2000)).toBe(50);
    expect(rolloverExtra(totalsByDate([meal("2026-10-16", 1000)]), today, 2000)).toBe(200); // máximo 200
    expect(rolloverExtra(totalsByDate([meal("2026-10-16", 2300)]), today, 2000)).toBe(0);
    expect(rolloverExtra({}, today, 2000)).toBe(0);
  });

  it("resume la semana con un consejo según los datos", () => {
    const days = ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", today];
    const good = totalsByDate(days.map((date) => meal(date, 2100, 140)));
    const summary = weeklyIntake(good, [{ date: "2026-10-09", kg: 68 }, { date: "2026-10-16", kg: 68.4 }], 2000, 130, today);
    expect(summary).toMatchObject({ loggedDays: 7, avgKcal: 2100, prevAvgKcal: null, daysOnTarget: 7, avgProteinG: 140, tip: "good" });
    expect(summary.weightDeltaKg).toBeCloseTo(0.4, 5);

    expect(weeklyIntake(totalsByDate([meal(today, 2000)]), [], 2000, null, today).tip).toBe("few_logs");
    expect(weeklyIntake(totalsByDate(days.map((date) => meal(date, 2500, 140))), [], 2000, 130, today).tip).toBe("over");
    expect(weeklyIntake(totalsByDate(days.map((date) => meal(date, 1500, 140))), [], 2000, 130, today).tip).toBe("under");
    expect(weeklyIntake(totalsByDate(days.map((date) => meal(date, 2000, 80))), [], 2000, 130, today).tip).toBe("protein");
    expect(weeklyIntake({}, [], 2000, 130, today)).toMatchObject({ loggedDays: 0, avgKcal: null, tip: null, weightDeltaKg: null });
  });
});

describe("reparto de macros editable", () => {
  it("los gramos cuadran con las calorías", () => {
    const grams = gramsFromSplit(2000, { protein: 30, carbs: 40, fat: 30 });
    expect(grams).toEqual({ proteinG: 150, carbsG: 200, fatG: 67 });
    expect(Math.abs(grams.proteinG * 4 + grams.carbsG * 4 + grams.fatG * 9 - 2000)).toBeLessThan(10);
  });

  it("saca el reparto de unos gramos, de 5 en 5 y sumando 100", () => {
    const split = splitFromGrams(2500, { proteinG: 140, carbsG: 300, fatG: 80 });
    expect(split.protein + split.carbs + split.fat).toBe(100);
    expect(split.protein % 5).toBe(0);
    expect(split.fat % 5).toBe(0);
  });

  it("rechaza calorías o repartos fuera de lo razonable", () => {
    expect(checkManualTarget(2000, { protein: 30, carbs: 40, fat: 30 }, 1500)).toBeNull();
    expect(checkManualTarget(1200, { protein: 30, carbs: 40, fat: 30 }, 1500)).toContain("mínimo");
    expect(checkManualTarget(2000, { protein: 30, carbs: 40, fat: 25 }, 1500)).toContain("100 %");
    expect(checkManualTarget(2000, { protein: 5, carbs: 65, fat: 30 }, 1500)).toContain("razonable");
  });
});
