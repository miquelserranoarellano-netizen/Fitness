// Lógica nutricional con respuestas simuladas: sin red ni claves.
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { LookupUnavailableError, _internals, lookupBarcode, lookupFood } from "../src/nutrition.js";

const { parseUsdaFood, macrosCoherent, pickCandidate, clearCache } = _internals;

const realFetch = globalThis.fetch;
let calls = 0;
const respond = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

beforeEach(() => {
  clearCache();
  calls = 0;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const chicken = parseUsdaFood({
  description: "Chicken, breast, grilled",
  foodNutrients: [
    { nutrientNumber: "208", value: 165 },
    { nutrientNumber: "203", value: 31 },
    { nutrientNumber: "204", value: 3.6 },
    { nutrientNumber: "205", value: 0 },
  ],
});

describe("USDA", () => {
  test("lee la energía por el número 208", () => {
    assert.equal(chicken.kcal100, 165);
    assert.equal(chicken.protein100, 31);
    assert.equal(chicken.fiber100, null);
  });

  test("sin energía directa la calcula con 4/4/9", () => {
    const food = parseUsdaFood({
      description: "Test food",
      foodNutrients: [
        { nutrientNumber: "203", value: 10 },
        { nutrientNumber: "204", value: 10 },
        { nutrientNumber: "205", value: 20 },
      ],
    });
    assert.equal(food.kcal100, 10 * 4 + 20 * 4 + 10 * 9);
  });

  test("sin datos suficientes devuelve null", () => {
    assert.equal(parseUsdaFood({ description: "x", foodNutrients: [] }), null);
  });

  test("lee fibra, azúcar y sodio", () => {
    const bread = parseUsdaFood({
      description: "Bread",
      foodNutrients: [
        { nutrientNumber: "208", value: 265 },
        { nutrientNumber: "203", value: 9 },
        { nutrientNumber: "204", value: 3.2 },
        { nutrientNumber: "205", value: 49 },
        { nutrientNumber: "291", value: 2.7 },
        { nutrientNumber: "269", value: 5 },
        { nutrientNumber: "307", value: 491 },
      ],
    });
    assert.equal(bread.fiber100, 2.7);
    assert.equal(bread.sugar100, 5);
    assert.equal(bread.sodium100, 491);
  });
});

describe("selección de candidatos", () => {
  test("comprueba la coherencia de los macros", () => {
    assert.equal(macrosCoherent({ kcal100: 165, protein100: 31, carbs100: 0, fat100: 3.6 }), true);
    assert.equal(macrosCoherent({ kcal100: 800, protein100: 1, carbs100: 1, fat100: 1 }), false);
  });

  test("descarta los que se alejan de la estimación de la IA (crudo frente a cocinado)", () => {
    const picked = pickCandidate(
      [
        { source: "usda", matchedName: "Rice, raw", kcal100: 365, protein100: 7, carbs100: 80, fat100: 0.7 },
        { source: "usda", matchedName: "Rice, cooked", kcal100: 130, protein100: 2.7, carbs100: 28, fat100: 0.3 },
      ],
      130,
    );
    assert.equal(picked.matchedName, "Rice, cooked");
  });
});

describe("lookupFood", () => {
  const fakeDatabases = async (url) => {
    calls++;
    const u = String(url);
    if (u.includes("api.nal.usda.gov")) {
      return respond({
        foods: [
          {
            description: "Rice, white, cooked",
            foodNutrients: [
              { nutrientNumber: "208", value: 130 },
              { nutrientNumber: "203", value: 2.7 },
              { nutrientNumber: "204", value: 0.3 },
              { nutrientNumber: "205", value: 28 },
            ],
          },
        ],
      });
    }
    if (u.includes("openfoodfacts")) {
      return respond({
        products: [
          {
            product_name: "Barrita de cereales",
            nutriments: { "energy-kcal_100g": 400, proteins_100g: 6, carbohydrates_100g: 65, fat_100g: 12 },
          },
        ],
      });
    }
    throw new Error("URL inesperada");
  };

  test("busca en USDA y guarda en caché", async () => {
    globalThis.fetch = fakeDatabases;
    const rice = await lookupFood({ search_query_en: "white rice cooked", name: "Arroz", is_packaged: false, grams: 200, calories: 260 });
    assert.equal(rice.source, "usda");
    assert.equal(rice.kcal100, 130);

    const before = calls;
    await lookupFood({ search_query_en: "white rice cooked", name: "Arroz", grams: 100, calories: 130 });
    assert.equal(calls, before);
  });

  test("un producto envasado va primero a Open Food Facts", async () => {
    globalThis.fetch = fakeDatabases;
    const bar = await lookupFood({ search_query_en: "cereal bar", name: "Barrita", is_packaged: true, grams: 30, calories: 120 });
    assert.equal(bar.source, "off");
  });

  test("si la red falla devuelve null (se queda la estimación de la IA)", async () => {
    globalThis.fetch = async () => {
      throw new Error("sin red");
    };
    assert.equal(await lookupFood({ search_query_en: "something unique", name: "x", grams: 100, calories: 100 }), null);
  });
});

describe("lookupBarcode", () => {
  const cookies = {
    status: 1,
    product: {
      product_name: "Galletas",
      brands: "Marca, Otra",
      serving_quantity: "30",
      nutriments: {
        "energy-kcal_100g": 450,
        proteins_100g: 6,
        carbohydrates_100g: 70,
        fat_100g: 16,
        fiber_100g: 3,
        sugars_100g: 20,
        salt_100g: 1.25,
      },
    },
  };

  test("lee el producto y pasa la sal a sodio", async () => {
    globalThis.fetch = async (url) => (String(url).includes("/product/8410000000017") ? respond(cookies) : respond({ status: 0 }));
    const product = await lookupBarcode("8410000000017");
    assert.equal(product.name, "Galletas");
    assert.equal(product.brand, "Marca");
    assert.equal(product.servingGrams, 30);
    assert.equal(product.per100.kcal100, 450);
    assert.equal(product.per100.sodium100, 500); // 1,25 g de sal = 500 mg de sodio
  });

  test("un producto que no existe devuelve null (también con 404)", async () => {
    globalThis.fetch = async () => respond({ status: 0 });
    assert.equal(await lookupBarcode("8410000000999"), null);
    globalThis.fetch = async () => respond({ status: 0, status_verbose: "product not found" }, 404);
    assert.equal(await lookupBarcode("8410000000998"), null);
  });

  test("si Open Food Facts no responde lanza LookupUnavailableError y no lo guarda", async () => {
    globalThis.fetch = async () => respond({}, 503);
    await assert.rejects(lookupBarcode("8410000000017"), LookupUnavailableError);
    globalThis.fetch = async () => respond(cookies);
    assert.equal((await lookupBarcode("8410000000017")).name, "Galletas");
  });
});

describe("privacidad de los registros", () => {
  test("si una base de datos falla, el aviso no dice qué se buscaba", async (t) => {
    const warnings = [];
    t.mock.method(console, "warn", (...args) => warnings.push(args.join(" ")));
    globalThis.fetch = async () => {
      throw new Error("sin red");
    };
    assert.equal(await lookupFood({ search_query_en: "secret salmon sashimi", name: "Sashimi", grams: 100, calories: 200 }), null);
    await assert.rejects(lookupBarcode("8000500310427"), LookupUnavailableError);
    assert.ok(warnings.length >= 3);
    for (const line of warnings) {
      assert.ok(!line.includes("salmon"), line);
      assert.ok(!line.includes("8000500310427"), line);
    }
  });
});
