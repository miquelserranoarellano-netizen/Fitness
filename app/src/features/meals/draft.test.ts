import { describe, expect, it } from "vitest";
import type { FavoriteMeal } from "@/data/favorites";
import type { FoodEntry } from "@/integrations/nutrition/contract";
import type { MealAnalysis } from "@/lib/api";
import {
  avoidList,
  draftFromAnalysis,
  draftFromEntry,
  draftFromFavorite,
  draftName,
  draftRange,
  draftToEntry,
  draftTotals,
  draftWarnings,
  eatenAtFor,
  emptyDraft,
  emptyManualItem,
  manualItem,
  withGrams,
  withItem,
  withoutItem,
} from "./draft";

const analysis: MealAnalysis = {
  isFood: true,
  dishName: " Arroz con pollo ",
  items: [
    { name: "Arroz", grams: 200, calories: 260, proteinG: 5, carbsG: 57, fatG: 1, fiberG: 0.8, sugarG: null, sodiumMg: 2, dataSource: "usda", matchedName: "Rice, cooked", confidence: 0.9, mayContain: [] },
    { name: "Pollo", grams: 150, calories: 248, proteinG: 46, carbsG: 0, fatG: 5, fiberG: null, sugarG: null, sodiumMg: null, dataSource: "ai", matchedName: null, confidence: 0.7, mayContain: ["Gluten"] },
  ],
  caloriesMin: 440,
  caloriesMax: 580,
  notes: "Puede llevar aceite.",
  per100g: null,
  servingGrams: null,
};

describe("borrador desde el análisis", () => {
  it("copia los alimentos, el nombre limpio, el margen y los avisos", () => {
    const draft = draftFromAnalysis(analysis, "foto", { uri: "file:///foto.jpg", width: 4000, height: 3000 });
    expect(draft.name).toBe("Arroz con pollo");
    expect(draft.items).toHaveLength(2);
    expect(draftTotals(draft)).toMatchObject({ calories: 508, proteinG: 51, fiberG: 0.8, sugarG: null });
    expect(draftRange(draft)).toEqual({ min: 440, max: 580 });
    expect(draftWarnings(draft)).toEqual(["Gluten"]);
    expect(draft.newPhoto?.uri).toBe("file:///foto.jpg");
  });

  it("al cambiar gramos recalcula desde los valores de partida y mueve el margen en proporción", () => {
    let draft = draftFromAnalysis(analysis, "texto");
    const rice = draft.items[0]!.key;
    draft = withGrams(draft, rice, 100);
    expect(draft.items[0]).toMatchObject({ grams: 100, calories: 130, carbsG: 29, fiberG: 0.4 });
    draft = withGrams(draft, rice, 200);
    expect(draft.items[0]).toMatchObject({ grams: 200, calories: 260, carbsG: 57 }); // sin acumular redondeos
    draft = withGrams(draft, rice, 0);
    expect(draftTotals(draft).calories).toBe(248);
    expect(draftRange(draft)).toEqual({ min: Math.round((440 * 248) / 508), max: Math.round((580 * 248) / 508) });
  });

  it("quitar y añadir alimentos", () => {
    let draft = draftFromAnalysis(analysis, "texto");
    draft = withoutItem(draft, draft.items[1]!.key);
    expect(draftWarnings(draft)).toEqual([]);
    const added = manualItem({ ...emptyManualItem(), name: "Pan", grams: "40", calories: "100", carbsG: "20" });
    if (!added.ok) throw new Error(added.error);
    draft = withItem(draft, added.item);
    expect(draftTotals(draft)).toMatchObject({ calories: 360, carbsG: 77, proteinG: 5 });
    expect(added.item).toMatchObject({ dataSource: "manual", proteinG: null, fatG: null });
  });

  it("sin margen si el servidor no lo da", () => {
    expect(draftRange(draftFromAnalysis({ ...analysis, caloriesMin: 508, caloriesMax: 508 }, "codigo"))).toBeNull();
  });
});

describe("alimento a mano", () => {
  it("pide nombre, gramos y calorías; los macros son opcionales", () => {
    expect(manualItem({ ...emptyManualItem(), grams: "100", calories: "50" }).ok).toBe(false);
    expect(manualItem({ ...emptyManualItem(), name: "Manzana", calories: "50" }).ok).toBe(false);
    expect(manualItem({ ...emptyManualItem(), name: "Manzana", grams: "150" }).ok).toBe(false);
    expect(manualItem({ ...emptyManualItem(), name: "Manzana", grams: "150", calories: "78", proteinG: "abc" }).ok).toBe(false);
    const apple = manualItem({ ...emptyManualItem(), name: " Manzana ", grams: "150,4", calories: "78", proteinG: "0,4" });
    expect(apple.ok && apple.item).toMatchObject({ name: "Manzana", grams: 150, calories: 78, proteinG: 0 });
  });
});

describe("guardar", () => {
  it("convierte el borrador en la comida del contrato", () => {
    const draft = draftFromAnalysis(analysis, "foto");
    const entry = draftToEntry(draft, { name: draftName(draft, ""), eatenAt: "2026-10-17T13:30:00.000Z", photoUri: "file:///app/meal-photos/1.jpg" });
    expect(entry).toMatchObject({
      name: "Arroz con pollo",
      calories: 508,
      proteinG: 51,
      caloriesMin: 440,
      caloriesMax: 580,
      notes: "Puede llevar aceite.",
      photoUri: "file:///app/meal-photos/1.jpg",
    });
    expect(entry.items?.[1]).toEqual({ name: "Pollo", grams: 150, calories: 248, proteinG: 46, carbsG: 0, fatG: 5, fiberG: null, sugarG: null, sodiumMg: null, dataSource: "ai", matchedName: null, confidence: 0.7 });
  });

  it("nombre: el escrito, el del análisis o el del primer alimento", () => {
    const draft = draftFromAnalysis({ ...analysis, dishName: "" }, "texto");
    expect(draftName(draft, " Cena ")).toBe("Cena");
    expect(draftName(draft, "")).toBe("Arroz");
    expect(draftName(emptyDraft(), "")).toBe("Comida");
  });

  it("instante: ahora si es hoy, el de antes si no cambia el día, mediodía si es otro día", () => {
    const now = new Date(2026, 9, 17, 20, 15);
    expect(eatenAtFor("2026-10-17", now)).toBe(now.toISOString());
    expect(eatenAtFor("2026-10-15", now, { date: "2026-10-15", eatenAt: "2026-10-15T07:00:00.000Z" })).toBe("2026-10-15T07:00:00.000Z");
    expect(eatenAtFor("2026-10-14", now, { date: "2026-10-15", eatenAt: "2026-10-15T07:00:00.000Z" })).toBe(new Date(2026, 9, 14, 12).toISOString());
  });
});

describe("repetir y corregir", () => {
  const favorite: FavoriteMeal = {
    id: "f1",
    name: "Desayuno",
    calories: 300,
    proteinG: 20,
    carbsG: 30,
    fatG: 10,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    items: [{ name: "Yogur", grams: 125, calories: 300, proteinG: 20, carbsG: 30, fatG: 10, dataSource: "off" }],
    photoUri: "file:///app/meal-photos/f.jpg",
    createdAt: "2026-10-01T08:00:00.000Z",
    lastUsedAt: null,
  };

  it("una favorita conserva su foto, su id y sus alimentos", () => {
    const draft = draftFromFavorite(favorite);
    expect(draft).toMatchObject({ source: "favorita", favoriteId: "f1", photoUri: "file:///app/meal-photos/f.jpg", range: null });
    expect(draft.items[0]).toMatchObject({ name: "Yogur", grams: 125, dataSource: "off", fiberG: null });
  });

  it("una favorita sin alimentos se convierte en uno con sus totales", () => {
    const draft = draftFromFavorite({ ...favorite, items: [] });
    expect(draft.items).toHaveLength(1);
    expect(draftTotals(draft).calories).toBe(300);
  });

  const entry: FoodEntry = {
    id: "e1",
    source: "foto",
    externalId: "x",
    eatenAt: "2026-10-16T13:00:00.000Z",
    date: "2026-10-16",
    name: "Lentejas",
    calories: 450,
    proteinG: 25,
    carbsG: 60,
    fatG: 10,
    fiberG: 12,
    sugarG: null,
    sodiumMg: null,
    caloriesMin: 400,
    caloriesMax: 500,
    notes: "Con chorizo",
    photoUri: null,
    items: [],
  };

  it("corregir conserva el origen y el margen; repetir pasa a «favorita» sin margen ni notas", () => {
    expect(draftFromEntry(entry)).toMatchObject({ source: "foto", range: { min: 400, max: 500, total: 450 }, notes: "Con chorizo" });
    expect(draftFromEntry(entry, true)).toMatchObject({ source: "favorita", range: null, notes: "" });
    expect(draftFromEntry({ ...entry, source: "otra-app" }).source).toBe("manual");
  });
});

describe("lo que se evita", () => {
  it("junta alergias y alimentos excluidos sin repetir", () => {
    expect(avoidList(["gluten", "egg"], "cilantro; Huevo,\n  setas ")).toEqual(["Gluten", "Huevo", "cilantro", "setas"]);
    expect(avoidList([], null)).toEqual([]);
  });
});
