// Búsqueda de datos nutricionales reales por 100 g.
// 1) USDA FoodData Central (alimentos genéricos)  2) Open Food Facts (productos envasados)
// Si no hay coincidencia fiable, el llamador conserva la estimación de la IA.

const USDA_KEY = () => process.env.USDA_API_KEY || "DEMO_KEY";
const TIMEOUT_MS = 6000;
const CACHE_MAX = 2000;

const cache = new Map(); // clave: "tipo|consulta" -> valor por 100 g o null

function cacheGet(key) {
  return cache.has(key) ? { hit: true, value: cache.get(key) } : { hit: false };
}
function cacheSet(key, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, value);
}

// Open Food Facts pide identificar la app en el User-Agent.
async function fetchJson(url, { allowNotFound = false } = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Appcombinada/1.0" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (allowNotFound && res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** La base de datos no responde (distinto de "no existe"): la app lo cuenta como problema de conexión. */
export class LookupUnavailableError extends Error {}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// --- USDA ---------------------------------------------------------------

// Números de nutriente de USDA: 208 energía (kcal), 203 proteína, 204 grasa, 205 carbohidratos.
// Algunos alimentos "Foundation" traen la energía con Atwater (957/958) en lugar de 208.
function parseUsdaFood(food) {
  const byNumber = {};
  for (const n of food.foodNutrients || []) {
    const key = String(n.nutrientNumber ?? n.nutrientId ?? "");
    const value = num(n.value ?? n.amount);
    if (value !== null) byNumber[key] = value;
  }
  const protein = byNumber["203"] ?? byNumber["1003"] ?? null;
  const fat = byNumber["204"] ?? byNumber["1004"] ?? null;
  const carbs = byNumber["205"] ?? byNumber["1005"] ?? null;
  let kcal =
    byNumber["208"] ?? byNumber["1008"] ?? byNumber["957"] ?? byNumber["958"] ?? byNumber["2047"] ?? byNumber["2048"] ?? null;

  if (kcal === null && protein !== null && fat !== null && carbs !== null) {
    kcal = protein * 4 + carbs * 4 + fat * 9;
  }
  if (kcal === null) return null;

  return {
    source: "usda",
    matchedName: food.description,
    kcal100: kcal,
    protein100: protein ?? 0,
    carbs100: carbs ?? 0,
    fat100: fat ?? 0,
    // Opcionales: null si la base de datos no los trae. Sodio en mg.
    fiber100: byNumber["291"] ?? byNumber["1079"] ?? null,
    sugar100: byNumber["269"] ?? byNumber["2000"] ?? byNumber["269.3"] ?? null,
    sodium100: byNumber["307"] ?? byNumber["1093"] ?? null,
  };
}

async function searchUsda(query) {
  const key = `usda|${query.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached.hit) return cached.value;

  let result = null;
  try {
    const params = new URLSearchParams({
      query,
      pageSize: "8",
      api_key: USDA_KEY(),
    });
    // Foundation y SR Legacy: valores por 100 g de alimentos genéricos. FNDDS (Survey): platos preparados.
    params.set("dataType", "Foundation,SR Legacy,Survey (FNDDS)");
    const data = await fetchJson(`https://api.nal.usda.gov/fdc/v1/foods/search?${params}`);
    const parsed = (data.foods || []).map(parseUsdaFood).filter(Boolean);
    result = parsed.length ? parsed : null;
  } catch (e) {
    console.warn("USDA falló:", query, e.message);
    return null; // no cacheamos fallos de red
  }
  cacheSet(key, result);
  return result;
}

// --- Open Food Facts ----------------------------------------------------

// Fibra, azúcar y sodio de Open Food Facts (vienen en gramos; el sodio lo pasamos a mg)
function offExtras(n) {
  const sodiumG = num(n["sodium_100g"]);
  const saltG = num(n["salt_100g"]);
  return {
    fiber100: num(n["fiber_100g"]),
    sugar100: num(n["sugars_100g"]),
    sodium100: sodiumG !== null ? sodiumG * 1000 : saltG !== null ? (saltG / 2.5) * 1000 : null,
  };
}

async function searchOff(query) {
  const key = `off|${query.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached.hit) return cached.value;

  let result = null;
  try {
    const params = new URLSearchParams({
      search_terms: query,
      search_simple: "1",
      action: "process",
      json: "1",
      page_size: "8",
      fields: "product_name,nutriments",
    });
    const data = await fetchJson(`https://world.openfoodfacts.org/cgi-bin/search.pl?${params}`);
    const parsed = (data.products || [])
      .map((p) => {
        const n = p.nutriments || {};
        const kcal = num(n["energy-kcal_100g"]);
        if (kcal === null || !p.product_name) return null;
        return {
          source: "off",
          matchedName: p.product_name,
          kcal100: kcal,
          protein100: num(n["proteins_100g"]) ?? 0,
          carbs100: num(n["carbohydrates_100g"]) ?? 0,
          fat100: num(n["fat_100g"]) ?? 0,
          ...offExtras(n),
        };
      })
      .filter(Boolean);
    result = parsed.length ? parsed : null;
  } catch (e) {
    console.warn("Open Food Facts falló:", query, e.message);
    return null;
  }
  cacheSet(key, result);
  return result;
}

// --- Selección ----------------------------------------------------------

// Coherencia de macros: kcal ≈ 4P + 4C + 9F (con tolerancia por fibra, alcohol, redondeos).
function macrosCoherent(c) {
  const est = c.protein100 * 4 + c.carbs100 * 4 + c.fat100 * 9;
  if (c.kcal100 < 15) return est < 40;
  return est >= c.kcal100 * 0.6 && est <= c.kcal100 * 1.4;
}

// Elegimos el primer candidato coherente cuyo valor por 100 g no se aleje
// demasiado de lo que estimó la IA (evita errores como confundir crudo con frito).
function pickCandidate(candidates, aiKcal100) {
  for (const c of candidates || []) {
    if (c.kcal100 > 900) continue; // imposible (>900 kcal/100 g)
    if (!macrosCoherent(c)) continue;
    if (aiKcal100 > 20 && c.kcal100 > 20) {
      const ratio = c.kcal100 / aiKcal100;
      if (ratio < 0.4 || ratio > 2.5) continue;
    }
    return c;
  }
  return null;
}

/**
 * Devuelve datos por 100 g para un alimento, o null si no hay coincidencia fiable.
 * item: { search_query_en, name, is_packaged, grams, calories }
 */
export async function lookupFood(item) {
  const query = (item.search_query_en || item.name || "").trim();
  if (!query || !(item.grams > 0)) return null;
  const aiKcal100 = item.calories > 0 ? (item.calories / item.grams) * 100 : 0;

  const order = item.is_packaged ? [searchOff, searchUsda] : [searchUsda, searchOff];
  for (const search of order) {
    const found = pickCandidate(await search(query), aiKcal100);
    if (found) return found;
  }
  return null;
}

/**
 * Producto envasado por código de barras (Open Food Facts).
 * Devuelve { name, brand, servingGrams, per100 } o null si no existe o no tiene calorías.
 * Lanza `LookupUnavailableError` si Open Food Facts no responde.
 */
export async function lookupBarcode(code) {
  const key = `barcode|${code}`;
  const cached = cacheGet(key);
  if (cached.hit) return cached.value;
  let result = null;
  const params = new URLSearchParams({
    fields: "product_name,brands,nutriments,serving_quantity",
  });
  let data;
  try {
    data = await fetchJson(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?${params}`,
      { allowNotFound: true }
    );
  } catch (e) {
    console.warn("Código de barras falló:", code, e.message);
    throw new LookupUnavailableError("Open Food Facts no responde", { cause: e }); // no cacheamos fallos de red
  }
  const p = data?.product;
  if (data?.status === 1 && p) {
    const n = p.nutriments || {};
    let kcal = num(n["energy-kcal_100g"]);
    const protein = num(n["proteins_100g"]) ?? 0;
    const carbs = num(n["carbohydrates_100g"]) ?? 0;
    const fat = num(n["fat_100g"]) ?? 0;
    if (kcal === null && (num(n["proteins_100g"]) !== null || num(n["fat_100g"]) !== null)) {
      kcal = protein * 4 + carbs * 4 + fat * 9;
    }
    if (kcal !== null && kcal <= 900) {
      const serving = Number(p.serving_quantity);
      result = {
        name: String(p.product_name || "").trim() || null,
        brand: String(p.brands || "").split(",")[0].trim() || null,
        servingGrams: Number.isFinite(serving) && serving > 0 && serving <= 2000 ? serving : null,
        per100: { kcal100: kcal, protein100: protein, carbs100: carbs, fat100: fat, ...offExtras(n) },
      };
    }
  }
  cacheSet(key, result);
  return result;
}

// Funciones puras exportadas para los tests
export const _internals = { parseUsdaFood, macrosCoherent, pickCandidate, clearCache: () => cache.clear() };
