import { beforeEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrations";
import { openTestDb } from "@/db/node";
import type { Db } from "@/db/types";
import { deleteFoodEntry, getDayIntake, getFoodEntry, listFoodEntriesBetween, listRecentMeals, saveFoodEntries, updateFoodEntry } from "@/integrations/nutrition/store";
import { addDays, today } from "@/lib/dates";
import { addWater, getSteps, getWater, listSteps, setSteps, setWater } from "./daily";
import { exportAllData } from "./export";
import { addFavorite, findFavorite, listFavorites, markFavoriteUsed, removeFavorite } from "./favorites";
import { getCurrentTarget, listNutritionTargets } from "./nutrition";
import { getProfile, setState } from "./profile";
import { getCalorieCalendar, getNutritionDay } from "./nutrition-day";
import { completeOnboarding, deleteAllData, recalculateTarget, setManualTarget, updateNutritionPreferences } from "./services";
import { DEFAULT_SETTINGS, getSettings, updateSettings } from "./settings";
import { onboardingInput } from "./testing";

const rice = { name: "Arroz blanco", grams: 200, calories: 260, proteinG: 5, carbsG: 57, fatG: 1, fiberG: 0.8, sodiumMg: 2, dataSource: "usda" as const, matchedName: "Rice, white, cooked", confidence: 0.9 };
const chicken = { name: "Pechuga de pollo", grams: 150, calories: 248, proteinG: 46, carbsG: 0, fatG: 5, dataSource: "ai" as const, confidence: 0.7 };

function meal(overrides: Record<string, unknown> = {}) {
  return {
    eatenAt: new Date().toISOString(),
    date: today(),
    name: "Arroz con pollo",
    calories: 508,
    proteinG: 51,
    carbsG: 57,
    fatG: 6,
    fiberG: 0.8,
    sodiumMg: 2,
    caloriesMin: 440,
    caloriesMax: 580,
    notes: "Puede llevar aceite.",
    photoUri: "file:///datos/meal-photos/1.jpg",
    items: [rice, chicken],
    ...overrides,
  };
}

const count = async (db: Db, table: string) => (await db.get<{ n: number }>(`select count(*) as n from ${table}`))?.n ?? 0;

let db: Db;

beforeEach(async () => {
  db = await openTestDb();
});

describe("migración 2", () => {
  it("actualiza una base de datos de la versión 1 sin perder lo que había", async () => {
    const old = await openTestDb(":memory:", 1);
    await old.run(
      "insert into food_entries (id, source, external_id, eaten_at, logged_on, name, calories, created_at) values ('c1', 'app-fotos', 'x1', '2026-10-16T13:00:00Z', '2026-10-16', 'Lentejas', 450, '2026-10-16T13:00:00Z')",
    );
    expect((await old.all<{ version: number }>("select version from schema_migrations")).map((row) => row.version)).toEqual([1]);

    await migrate(old);
    expect((await old.all<{ version: number }>("select version from schema_migrations order by version")).map((row) => row.version)).toEqual([1, 2, 3]);
    const columns = (await old.all<{ name: string }>("pragma table_info(food_entries)")).map((row) => row.name);
    expect(columns).toEqual(expect.arrayContaining(["fiber_g", "sugar_g", "sodium_mg", "calories_min", "calories_max", "notes", "updated_at"]));
    const kept = await getFoodEntry(old, "c1");
    expect(kept).toMatchObject({ name: "Lentejas", calories: 450, fiberG: null, items: [] });
    for (const table of ["food_entry_items", "favorite_meals", "water_logs", "step_logs"]) expect(await count(old, table)).toBe(0);

    // Volver a migrar no hace nada.
    await migrate(old);
    expect(await count(old, "schema_migrations")).toBe(3);
  });
});

describe("comidas", () => {
  it("guarda una comida con sus alimentos y devuelve su id", async () => {
    const result = await saveFoodEntries(db, "foto", [meal()]);
    expect(result).toMatchObject({ saved: 1, rejected: [] });
    expect(result.ids).toHaveLength(1);

    const saved = (await getFoodEntry(db, result.ids[0]!))!;
    expect(saved).toMatchObject({ source: "foto", name: "Arroz con pollo", calories: 508, caloriesMin: 440, caloriesMax: 580, notes: "Puede llevar aceite.", sugarG: null });
    expect(saved.externalId).toBeTruthy(); // se crea uno si no viene
    expect(saved.items?.map((item) => [item.position, item.name, item.dataSource])).toEqual([
      [0, "Arroz blanco", "usda"],
      [1, "Pechuga de pollo", "ai"],
    ]);
    expect(saved.items?.[0]).toMatchObject({ matchedName: "Rice, white, cooked", confidence: 0.9, fiberG: 0.8 });
    expect(saved.items?.[1]).toMatchObject({ fiberG: null, matchedName: null });
  });

  it("al reenviar la misma comida la actualiza y sustituye sus alimentos", async () => {
    const first = await saveFoodEntries(db, "app-externa", [meal({ externalId: "e1" })]);
    const again = await saveFoodEntries(db, "app-externa", [meal({ externalId: "e1", calories: 260, items: [rice] })]);
    expect(again.ids).toEqual(first.ids);
    const entry = (await getFoodEntry(db, first.ids[0]!))!;
    expect(entry.calories).toBe(260);
    expect(entry.items).toHaveLength(1);
    expect(await count(db, "food_entries")).toBe(1);
  });

  it("rechaza comidas o alimentos no válidos sin guardar nada", async () => {
    const result = await saveFoodEntries(db, "foto", [meal({ name: "" }), meal({ items: [{ ...rice, grams: 6000 }] }), meal({ calories: -1 })]);
    expect(result.saved).toBe(0);
    expect(result.rejected.map((item) => item.index)).toEqual([0, 1, 2]);
    expect(await count(db, "food_entries")).toBe(0);
  });

  it("corrige y borra comidas", async () => {
    const [id] = (await saveFoodEntries(db, "foto", [meal()])).ids;
    const edited = await updateFoodEntry(db, id!, meal({ name: "Arroz con pollo (ración pequeña)", calories: 380, items: [{ ...rice, grams: 150, calories: 195 }, chicken] }));
    expect(edited).toEqual({ ok: true });
    const entry = (await getFoodEntry(db, id!))!;
    expect(entry).toMatchObject({ name: "Arroz con pollo (ración pequeña)", calories: 380, source: "foto" });
    expect(entry.items?.[0]?.grams).toBe(150);

    expect((await updateFoodEntry(db, id!, meal({ calories: "mucho" }))).ok).toBe(false);
    expect(await updateFoodEntry(db, "no-existe", meal())).toEqual({ ok: false, error: "Esa comida ya no existe." });

    expect(await deleteFoodEntry(db, id!)).toEqual({ deleted: true, photoUri: "file:///datos/meal-photos/1.jpg" });
    expect(await count(db, "food_entry_items")).toBe(0); // se borran con la comida
    expect(await deleteFoodEntry(db, id!)).toEqual({ deleted: false, photoUri: null });
  });

  it("suma el día, también fibra y sodio cuando los hay", async () => {
    await saveFoodEntries(db, "foto", [meal()]);
    await saveFoodEntries(db, "texto", [meal({ name: "Yogur", calories: 120, proteinG: 10, carbsG: 8, fatG: 5, fiberG: null, sodiumMg: 60, items: [] })]);
    await saveFoodEntries(db, "codigo", [meal({ name: "Ayer", date: addDays(today(), -1), calories: 999 })]);
    const intake = await getDayIntake(db, today());
    expect(intake).toMatchObject({ calories: 628, proteinG: 61, carbsG: 65, fatG: 11, fiberG: 0.8, sugarG: null, sodiumMg: 62 });
    expect(intake.entries).toHaveLength(2);
    expect(await listFoodEntriesBetween(db, addDays(today(), -1), today())).toHaveLength(3);
  });

  it("lista las comidas recientes sin repetir y con sus alimentos", async () => {
    await saveFoodEntries(db, "foto", [meal({ eatenAt: "2026-10-15T13:00:00Z" })]);
    await saveFoodEntries(db, "foto", [meal({ name: "arroz con pollo ", eatenAt: "2026-10-16T13:00:00Z" })]);
    await saveFoodEntries(db, "texto", [meal({ name: "Tostada", calories: 150, eatenAt: "2026-10-16T08:00:00Z", items: [] })]);
    const recent = await listRecentMeals(db);
    expect(recent.map((entry) => entry.name)).toEqual(["arroz con pollo", "Tostada"]);
    expect(recent[0]?.items).toHaveLength(2);
  });
});

describe("favoritas", () => {
  const favorite = { name: "Arroz con pollo", calories: 508, proteinG: 51, items: [rice, chicken], photoUri: "file:///datos/meal-photos/1.jpg" };

  it("no duplica la misma comida y se ordenan por uso", async () => {
    const first = await addFavorite(db, favorite);
    expect(first.ok).toBe(true);
    expect(await addFavorite(db, { ...favorite, name: " arroz con POLLO" })).toEqual(first);
    expect((await addFavorite(db, { ...favorite, name: "" })).ok).toBe(false);

    const second = await addFavorite(db, { name: "Batido", calories: 300 });
    // Fechas fijas para que el orden no dependa de que se guarden en el mismo milisegundo.
    await db.run("update favorite_meals set created_at = '2026-01-01T00:00:00.000Z' where name = 'Arroz con pollo'");
    await db.run("update favorite_meals set created_at = '2026-06-01T00:00:00.000Z' where name = 'Batido'");
    expect((await listFavorites(db)).map((item) => item.name)).toEqual(["Batido", "Arroz con pollo"]);
    if (first.ok) await markFavoriteUsed(db, first.id);
    const list = await listFavorites(db);
    expect(list.map((item) => item.name)).toEqual(["Arroz con pollo", "Batido"]);
    expect(list[0]?.items).toHaveLength(2);
    expect(await findFavorite(db, "ARROZ CON POLLO", 508.2)).not.toBeNull();

    if (second.ok) expect(await removeFavorite(db, second.id)).toEqual({ photoUri: null });
    if (first.ok) expect(await removeFavorite(db, first.id)).toEqual({ photoUri: favorite.photoUri });
    expect(await listFavorites(db)).toHaveLength(0);
  });

  it("guarda como mucho 100", async () => {
    for (let index = 0; index < 101; index++) await addFavorite(db, { name: `Comida ${index}`, calories: index });
    expect(await count(db, "favorite_meals")).toBe(100);
  });
});

describe("agua, pasos y ajustes", () => {
  it("registra el agua del día sin bajar de cero", async () => {
    expect(await getWater(db, today())).toBe(0);
    expect(await addWater(db, today(), 250)).toEqual({ ok: true, data: 250 });
    expect(await addWater(db, today(), 250)).toEqual({ ok: true, data: 500 });
    expect(await addWater(db, today(), -800)).toEqual({ ok: true, data: 0 });
    expect(await setWater(db, today(), 99999)).toEqual({ ok: true, data: 20000 });
    expect((await setWater(db, addDays(today(), 1), 250)).ok).toBe(false);
  });

  it("registra los pasos de cada día con su origen", async () => {
    expect(await getSteps(db, today())).toBeNull();
    expect(await setSteps(db, today(), 8432.4, "manual")).toEqual({ ok: true, data: 8432 });
    expect(await setSteps(db, today(), 9000, "pedometer")).toEqual({ ok: true, data: 9000 });
    expect(await getSteps(db, today())).toEqual({ date: today(), steps: 9000, source: "pedometer" });
    expect((await setSteps(db, today(), -1, "manual")).ok).toBe(false);
    expect((await setSteps(db, today(), 300000, "manual")).ok).toBe(false);
    await setSteps(db, addDays(today(), -1), 5000, "manual");
    expect((await listSteps(db, addDays(today(), -7), today())).map((entry) => entry.steps)).toEqual([5000, 9000]);
  });

  it("guarda los ajustes y recupera los que no son válidos", async () => {
    expect(await getSettings(db)).toEqual(DEFAULT_SETTINGS);
    const updated = await updateSettings(db, { stepGoal: 8000, rollover: true });
    expect(updated.ok && updated.data).toMatchObject({ stepGoal: 8000, rollover: true, waterGoalMl: 2000 });
    expect((await updateSettings(db, { stepGoal: 5 })).ok).toBe(false);
    expect((await getSettings(db)).stepGoal).toBe(8000);

    await setState(db, "ajustes", { stepGoal: 5, waterGoalMl: 2500, rollover: true });
    expect(await getSettings(db)).toMatchObject({ stepGoal: 10000, waterGoalMl: 2500, rollover: true });
  });
});

describe("preferencias de dieta", () => {
  beforeEach(async () => {
    await completeOnboarding(db, onboardingInput());
  });

  it("el reparto cetogénico cambia los macros al recalcular, no las calorías", async () => {
    const before = (await getCurrentTarget(db))!;
    expect((await getProfile(db))?.macroStyle).toBe("standard");

    expect(await updateNutritionPreferences(db, { macroStyle: "keto", targetWeightKg: null })).toEqual({ ok: true, data: { nutritionAffected: true } });
    expect((await getProfile(db))?.macroStyle).toBe("keto");
    expect((await recalculateTarget(db)).ok).toBe(true);

    const after = (await getCurrentTarget(db))!;
    expect(after.calories).toBe(before.calories);
    expect(after.proteinG).toBe(before.proteinG);
    expect(after.carbsG).toBeLessThan(50);
    expect(after.method.macroStyle).toBe("keto");
  });

  it("el peso deseado va en la dirección del objetivo", async () => {
    // Objetivo: ganar músculo, con 68 kg.
    expect(await updateNutritionPreferences(db, { macroStyle: "standard", targetWeightKg: 60 })).toEqual({
      ok: false,
      error: "Para ganar músculo, el peso deseado tiene que ser mayor que el actual.",
    });
    expect((await updateNutritionPreferences(db, { macroStyle: "standard", targetWeightKg: 400 })).ok).toBe(false);
    expect(await updateNutritionPreferences(db, { macroStyle: "standard", targetWeightKg: 74.26 })).toEqual({ ok: true, data: { nutritionAffected: false } });
    expect((await getProfile(db))?.targetWeightKg).toBe(74.3);
  });
});

describe("exportar y borrar", () => {
  it("exporta y borra también las tablas de nutrición", async () => {
    await completeOnboarding(db, onboardingInput());
    await saveFoodEntries(db, "foto", [meal()]);
    await addFavorite(db, { name: "Batido", calories: 300, items: [rice] });
    await setWater(db, today(), 750);
    await setSteps(db, today(), 7000, "manual");

    const data = await exportAllData(db);
    expect(data.formato).toBe("appcombinada/exportacion@2");
    expect((data.food_entry_items as unknown[]).length).toBe(2);
    expect((data.favorite_meals as { items: unknown[] }[])[0]?.items).toHaveLength(1); // JSON ya como objeto
    expect(data.water_logs).toEqual([expect.objectContaining({ ml: 750 })]);
    expect(data.step_logs).toEqual([expect.objectContaining({ steps: 7000, source: "manual" })]);

    await deleteAllData(db);
    for (const table of ["food_entries", "food_entry_items", "favorite_meals", "water_logs", "step_logs", "profiles"]) expect(await count(db, table)).toBe(0);
  });
});

describe("migración 3: objetivo puesto a mano", () => {
  it("conserva los objetivos que había y acepta el motivo «manual»", async () => {
    const old = await openTestDb(":memory:", 2);
    expect((await completeOnboarding(old, onboardingInput())).ok).toBe(true);
    const before = await listNutritionTargets(old);
    await migrate(old);
    expect(await listNutritionTargets(old)).toEqual(before);
    expect((await setManualTarget(old, { calories: 2500, split: { protein: 30, carbs: 45, fat: 25 } })).ok).toBe(true);
  });
});

describe("objetivo puesto a mano", () => {
  beforeEach(async () => {
    expect((await completeOnboarding(db, onboardingInput())).ok).toBe(true);
  });

  it("guarda calorías y gramos que cuadran, y pasa a ser el objetivo actual", async () => {
    const result = await setManualTarget(db, { calories: 2400, split: { protein: 30, carbs: 40, fat: 30 } });
    expect(result).toEqual({ ok: true, data: { calories: 2400 } });
    const target = (await getCurrentTarget(db))!;
    expect(target).toMatchObject({ reason: "manual", calories: 2400, proteinG: 180, carbsG: 240, fatG: 80 });
    expect(target.method.manual).toEqual({ protein: 30, carbs: 40, fat: 30 });
    // Recalcular con el perfil vuelve a la estimación.
    expect((await recalculateTarget(db)).ok).toBe(true);
    expect((await getCurrentTarget(db))!.reason).toBe("profile_change");
  });

  it("no acepta un objetivo por debajo del mínimo ni un reparto que no sume 100", async () => {
    expect((await setManualTarget(db, { calories: 900, split: { protein: 30, carbs: 40, fat: 30 } })).ok).toBe(false);
    expect((await setManualTarget(db, { calories: 2400, split: { protein: 30, carbs: 40, fat: 20 } })).ok).toBe(false);
    expect((await getCurrentTarget(db))!.reason).toBe("initial");
  });
});

describe("pantalla de nutrición y calendario", () => {
  beforeEach(async () => {
    expect((await completeOnboarding(db, onboardingInput())).ok).toBe(true);
  });

  it("sabe si ya se ha registrado alguna comida con la cámara", async () => {
    expect((await getNutritionDay(db, today())).hasPhotoMeal).toBe(false);
    await saveFoodEntries(db, "texto", [meal({ photoUri: null })]);
    expect((await getNutritionDay(db, today())).hasPhotoMeal).toBe(false);
    await saveFoodEntries(db, "foto", [meal()]);
    const day = await getNutritionDay(db, today());
    expect(day.hasPhotoMeal).toBe(true);
    expect(day.intake.entries).toHaveLength(2);
    expect(day.waterMl).toBe(0);
  });

  it("marca en verde los días entre el 90 % y el 105 % y en rojo el resto", async () => {
    const goal = (await getCurrentTarget(db))!.calories;
    const day = (offset: number) => addDays(today(), offset);
    await saveFoodEntries(db, "foto", [
      meal({ date: day(-3), eatenAt: `${day(-3)}T13:00:00Z`, calories: Math.round(goal * 0.95) }),
      meal({ date: day(-2), eatenAt: `${day(-2)}T13:00:00Z`, calories: Math.round(goal * 1.3) }),
    ]);
    const { days, summary } = await getCalorieCalendar(db, day(-4), today(), today());
    expect(days.map((entry) => entry.status)).toEqual(["none", "good", "bad", "bad", "none"]);
    expect(summary).toMatchObject({ good: 1, bad: 2, logged: 2 });
    expect(days.every((entry) => entry.goal === goal)).toBe(true);
  });
});
