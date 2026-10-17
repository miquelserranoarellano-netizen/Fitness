import { beforeEach, describe, expect, it } from "vitest";
import { openTestDb } from "@/db/node";
import type { Db } from "@/db/types";
import { draftFromAnalysis, draftFromEntry, draftFromFavorite, emptyDraft, withGrams } from "@/features/meals/draft";
import { getFoodEntry, listFoodEntries } from "@/integrations/nutrition/store";
import type { MealAnalysis } from "@/lib/api";
import { listFavorites } from "./favorites";
import { saveMeal } from "./meals";

const analysis: MealAnalysis = {
  isFood: true,
  dishName: "Tostada con huevo",
  items: [
    { name: "Pan", grams: 60, calories: 180, proteinG: 6, carbsG: 33, fatG: 2, fiberG: 1.8, sugarG: 3, sodiumMg: 300, dataSource: "usda", matchedName: "Bread", confidence: 0.8, mayContain: [] },
    { name: "Huevo frito", grams: 50, calories: 90, proteinG: 6, carbsG: 0, fatG: 7, fiberG: null, sugarG: null, sodiumMg: null, dataSource: "ai", matchedName: null, confidence: 0.9, mayContain: [] },
  ],
  caloriesMin: 240,
  caloriesMax: 300,
  notes: "",
  per100g: null,
  servingGrams: null,
};

let db: Db;
beforeEach(async () => {
  db = await openTestDb();
});

const options = { name: "Tostada con huevo", eatenAt: "2026-10-17T08:00:00.000Z", photoUri: "file:///app/meal-photos/t.jpg", favorite: false };

describe("guardar una comida revisada", () => {
  it("guarda la comida con sus alimentos y su origen", async () => {
    const result = await saveMeal(db, draftFromAnalysis(analysis, "foto"), options);
    if (!result.ok) throw new Error(result.error);
    const entry = await getFoodEntry(db, result.id);
    expect(entry).toMatchObject({ source: "foto", date: "2026-10-17", calories: 270, caloriesMin: 240, caloriesMax: 300, photoUri: "file:///app/meal-photos/t.jpg" });
    expect(entry?.items?.map((item) => item.name)).toEqual(["Pan", "Huevo frito"]);
    expect(await listFavorites(db)).toEqual([]);
  });

  it("sin alimentos no guarda nada", async () => {
    const result = await saveMeal(db, emptyDraft(), options);
    expect(result.ok).toBe(false);
    expect(await listFoodEntries(db, "2026-10-17")).toEqual([]);
  });

  it("con la estrella la guarda también en favoritas, sin duplicarla al repetirla", async () => {
    const first = await saveMeal(db, draftFromAnalysis(analysis, "foto"), { ...options, favorite: true });
    if (!first.ok) throw new Error(first.error);
    const [favorite] = await listFavorites(db);
    expect(favorite).toMatchObject({ name: "Tostada con huevo", calories: 270, photoUri: "file:///app/meal-photos/t.jpg" });
    expect(favorite?.items).toHaveLength(2);
    expect(first.favoriteId).toBe(favorite?.id);

    const again = await saveMeal(db, draftFromFavorite(favorite!), { ...options, eatenAt: "2026-10-17T20:00:00.000Z", favorite: true, favoriteIdBefore: favorite!.id });
    expect(again.ok && again.favoriteId).toBe(favorite?.id);
    expect(await listFavorites(db)).toHaveLength(1);
    expect(await listFoodEntries(db, "2026-10-17")).toHaveLength(2);
    expect((await listFoodEntries(db, "2026-10-17"))[1]?.source).toBe("favorita");
  });

  it("al quitar la estrella de una favorita la borra y devuelve su foto para liberarla", async () => {
    await saveMeal(db, draftFromAnalysis(analysis, "foto"), { ...options, favorite: true });
    const [favorite] = await listFavorites(db);
    const result = await saveMeal(db, draftFromFavorite(favorite!), { ...options, favorite: false, favoriteIdBefore: favorite!.id });
    expect(result.ok && result.releasedPhotoUri).toBe("file:///app/meal-photos/t.jpg");
    expect(await listFavorites(db)).toEqual([]);
  });

  it("corrige una comida existente: cambia gramos, totales y día, sin crear otra", async () => {
    const saved = await saveMeal(db, draftFromAnalysis(analysis, "texto"), options);
    if (!saved.ok) throw new Error(saved.error);
    const entry = await getFoodEntry(db, saved.id);
    let draft = draftFromEntry(entry!);
    draft = withGrams(draft, draft.items[0]!.key, 30);

    const result = await saveMeal(db, draft, { ...options, name: "Media tostada", eatenAt: "2026-10-16T12:00:00.000Z", entryId: saved.id });
    expect(result.ok).toBe(true);
    const updated = await getFoodEntry(db, saved.id);
    expect(updated).toMatchObject({ source: "texto", name: "Media tostada", date: "2026-10-16", calories: 180 });
    expect(updated?.items?.[0]).toMatchObject({ grams: 30, calories: 90, fiberG: 0.9 });
    expect(await listFoodEntries(db, "2026-10-17")).toEqual([]);
  });

  it("corregir una comida que ya no existe falla sin crear nada", async () => {
    const result = await saveMeal(db, draftFromAnalysis(analysis, "texto"), { ...options, favorite: true, entryId: "no-existe" });
    expect(result.ok).toBe(false);
    expect(await listFavorites(db)).toEqual([]);
  });
});
