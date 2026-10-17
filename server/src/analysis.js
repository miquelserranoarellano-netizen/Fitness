import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * Reconocimiento de comida con Claude (de SnapCal). La IA identifica los alimentos, estima los gramos y
 * propone una consulta en inglés para buscarlos; las calorías y macros definitivos salen de USDA u Open
 * Food Facts cuando hay una coincidencia fiable (ver `nutrition.js`).
 *
 * La respuesta llega con salida estructurada (`output_config.format` con un esquema JSON), así que ya
 * no se extrae el JSON del texto a mano. Además se valida con Zod, por si el modelo se para antes de
 * terminar o se niega.
 */

/** Idiomas de la app: la IA devuelve los nombres de los alimentos en el idioma elegido. */
export const LANGS = {
  es: { name: "español", meal: "Comida", food: "Alimento" },
  en: { name: "inglés (English)", meal: "Meal", food: "Food" },
  fr: { name: "francés (français)", meal: "Repas", food: "Aliment" },
  de: { name: "alemán (Deutsch)", meal: "Mahlzeit", food: "Lebensmittel" },
};

export const pickLanguage = (language) => (Object.hasOwn(LANGS, language) ? language : "es");

/** Lo que el usuario evita (alergias y alimentos excluidos): como mucho 20 entradas cortas. */
export function cleanAvoidList(avoid) {
  if (!Array.isArray(avoid)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of avoid) {
    if (typeof raw !== "string") continue;
    const value = raw.trim().slice(0, 40);
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push(value);
    if (out.length >= 20) break;
  }
  return out;
}

/* ───────────────────────────── Esquema de la respuesta ───────────────────────────── */

// La salida estructurada no admite mínimos ni máximos: los límites se aplican después, en `nutrition`.
const ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "search_query_en", "is_packaged", "grams", "calories", "protein_g", "carbs_g", "fat_g", "confidence", "may_contain"],
  properties: {
    name: { type: "string", description: "Nombre del alimento en el idioma pedido." },
    search_query_en: { type: "string", description: "Consulta corta en inglés para buscarlo en una base de datos nutricional." },
    is_packaged: { type: "boolean", description: "true solo si es un producto de marca o envasado reconocible." },
    grams: { type: "number", description: "Peso estimado tal como se come." },
    calories: { type: "number" },
    protein_g: { type: "number" },
    carbs_g: { type: "number" },
    fat_g: { type: "number" },
    confidence: { type: "number", description: "Seguridad de 0 a 1 al identificar el alimento y su cantidad." },
    may_contain: {
      type: "array",
      items: { type: "string" },
      description: "Elementos de la lista de cosas que el usuario evita que este alimento podría contener. Vacío si ninguno.",
    },
  },
};

export const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_food", "dish_name", "items", "notes"],
  properties: {
    is_food: { type: "boolean" },
    dish_name: { type: "string" },
    items: { type: "array", items: ITEM_SCHEMA },
    notes: { type: "string" },
  },
};

const itemSchema = z.object({
  name: z.string(),
  search_query_en: z.string(),
  is_packaged: z.boolean(),
  grams: z.number(),
  calories: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  confidence: z.number(),
  may_contain: z.array(z.string()).default([]),
});

export const analysisSchema = z.object({
  is_food: z.boolean(),
  dish_name: z.string(),
  items: z.array(itemSchema),
  notes: z.string(),
});

/* ───────────────────────────── Instrucciones ───────────────────────────── */

export function buildSystemPrompt(language, source, avoid) {
  const fromImage = source === "image";
  const lines = [
    `Eres un nutricionista experto en ${fromImage ? "identificar alimentos en fotos" : "interpretar descripciones de comidas"} y estimar sus cantidades.`,
    fromImage
      ? "Analiza la imagen del plato."
      : "Interpreta la descripción que escribe el usuario (puede ser un solo alimento o varios, con o sin cantidades).",
    "",
    "Reglas:",
    `- Si ${fromImage ? "la imagen no contiene comida" : "el texto no describe comida"}, devuelve is_food=false e items vacío.`,
    "- Descompón los platos mixtos en sus ingredientes principales (por ejemplo, una paella en arroz, pollo, marisco, verduras y aceite). No devuelvas el plato entero como un único elemento salvo que sea imposible separarlo.",
    `- "name", "dish_name" y "notes" van en ${LANGS[language].name}.`,
    '- "search_query_en" es una consulta corta en INGLÉS para buscar el alimento en una base de datos nutricional, con el estado de cocinado cuando importe. Ejemplos: "chicken breast grilled", "white rice cooked", "olive oil", "tomato raw", "french fries".',
    '- "is_packaged" es true solo si es un producto de marca o envasado reconocible (una barrita, un yogur, un refresco). Para comida casera o de restaurante, false.',
    fromImage
      ? '- Estima "grams" con referencias visuales (plato, cubiertos, manos): el peso tal como se ve en el plato (cocinado si está cocinado).'
      : '- Usa las cantidades que indique el usuario ("2 huevos", "200 g de arroz", "un vaso de leche") y conviértelas a gramos. Si no indica cantidad, usa una ración típica y razonable. "grams" es el peso tal como se come.',
    fromImage
      ? "- Incluye aceite, salsas y aderezos probables como elementos aparte cuando sea razonable."
      : "- No inventes ingredientes que el usuario no haya mencionado, salvo el aceite de cocinar si es evidente (por ejemplo, huevos fritos).",
    '- "calories" y los macros son tu mejor estimación para esa cantidad; solo se usarán si la base de datos no encuentra el alimento. Usa números enteros.',
    '- "confidence" va de 0 a 1.',
  ];
  if (avoid.length > 0) {
    lines.push(
      `- El usuario evita: ${avoid.join("; ")}. En "may_contain" de cada alimento pon, copiados tal cual de esa lista, los que podría contener (aunque sea como ingrediente habitual o trazas probables). Si ninguno, deja la lista vacía. No es un diagnóstico: es un aviso para que lo compruebe.`,
    );
  } else {
    lines.push('- Deja "may_contain" vacío.');
  }
  return lines.join("\n");
}

/* ───────────────────────────── Errores ───────────────────────────── */

/** Error con un código estable que el servidor devuelve a la app (y la app traduce a un mensaje). */
export class AnalysisError extends Error {
  constructor(code, status, message, cause) {
    super(message ?? code);
    this.code = code;
    this.status = status;
    if (cause) this.cause = cause;
  }
}

/** Traduce los errores del SDK de Anthropic a códigos de la app, del más concreto al más general. */
export function mapAnthropicError(error) {
  if (error instanceof AnalysisError) return error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AnalysisError("ai_auth_failed", 503, "La clave de Anthropic del servidor no es válida o no tiene permiso.", error);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AnalysisError("ai_busy", 429, "La IA está recibiendo demasiadas peticiones. Prueba en un momento.", error);
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new AnalysisError("ai_bad_request", 502, "La petición a la IA no es válida.", error);
  }
  if (error instanceof Anthropic.InternalServerError) {
    return new AnalysisError("ai_unavailable", 503, "La IA no está disponible ahora mismo.", error);
  }
  // En el SDK de TypeScript, el error de tiempo es una subclase del de conexión: va antes.
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AnalysisError("ai_timeout", 504, "La IA ha tardado demasiado en responder.", error);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AnalysisError("ai_unavailable", 503, "El servidor no ha podido conectar con la IA.", error);
  }
  if (error instanceof Anthropic.APIError) {
    return new AnalysisError("ai_unavailable", 502, `Error de la IA (${error.status ?? "?"}).`, error);
  }
  return new AnalysisError("server_error", 500, "Error inesperado al analizar la comida.", error);
}

/* ───────────────────────────── Llamada a Claude ───────────────────────────── */

const MAX_TOKENS = 16000;
// Con un reintento, como mucho ~100 s: la app espera 115 s (`app/src/lib/api.ts`).
const TIMEOUT_MS = 50_000;

/**
 * Pide a Claude el análisis de una foto o un texto. Devuelve la respuesta ya validada (aún sin las
 * cifras de las bases de datos). Lanza `AnalysisError` con un código estable.
 *
 * - Salida estructurada con `ANALYSIS_SCHEMA`.
 * - `fallbacks: "default"`: si el modelo declina por política, la API reintenta en otro modelo.
 * - `effort` opcional (`ANTHROPIC_EFFORT`); sin él, el del modelo.
 */
export async function requestAnalysis({ client, model, effort, source, language, imageBase64, mediaType, text, avoid }) {
  if (!client) throw new AnalysisError("ai_not_configured", 503, "El servidor no tiene configurada la clave de Anthropic.");

  const userContent =
    source === "image"
      ? [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: "Analiza este plato." },
        ]
      : [{ type: "text", text: `Comida: ${text}` }];

  let response;
  try {
    response = await client.beta.messages.create(
      {
        model,
        max_tokens: MAX_TOKENS,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: buildSystemPrompt(language, source, avoid),
        messages: [{ role: "user", content: userContent }],
        output_config: { ...(effort ? { effort } : {}), format: { type: "json_schema", schema: ANALYSIS_SCHEMA } },
      },
      { timeout: TIMEOUT_MS, maxRetries: 1 },
    );
  } catch (error) {
    throw mapAnthropicError(error);
  }
  return parseAnalysisResponse(response);
}

/** Comprueba por qué paró el modelo, junta el texto y lo valida con el esquema. */
export function parseAnalysisResponse(response) {
  if (response.stop_reason === "refusal") {
    throw new AnalysisError("ai_refused", 422, "La IA no ha querido analizar esta petición.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new AnalysisError("ai_invalid_response", 502, "La respuesta de la IA se ha cortado.");
  }
  const text = (response.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new AnalysisError("ai_invalid_response", 502, "La respuesta de la IA no es un JSON válido.", error);
  }
  const parsed = analysisSchema.safeParse(json);
  if (!parsed.success) throw new AnalysisError("ai_invalid_response", 502, "La respuesta de la IA no tiene la forma esperada.");
  return parsed.data;
}

/* ───────────────────────────── Resultado para la app ───────────────────────────── */

export const clampNum = (value, min, max, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

/** Fibra, azúcar y sodio solo se rellenan si la base de datos los trae. */
export function applyExtras(item, per100, factor) {
  const oneDecimal = (value) => Math.round(value * factor * 10) / 10;
  if (per100.fiber100 != null) item.fiber_g = oneDecimal(per100.fiber100);
  if (per100.sugar100 != null) item.sugar_g = oneDecimal(per100.sugar100);
  if (per100.sodium100 != null) item.sodium_mg = Math.round(per100.sodium100 * factor);
}

/** Solo se aceptan avisos que estén en la lista del usuario (sin inventar alérgenos nuevos). */
function filterMayContain(values, avoid) {
  const allowed = new Map(avoid.map((entry) => [entry.toLowerCase(), entry]));
  const out = [];
  for (const value of values ?? []) {
    const match = allowed.get(String(value).trim().toLowerCase());
    if (match && !out.includes(match)) out.push(match);
  }
  return out;
}

/** Sustituye las cifras de la IA por las de la base de datos cuando hay una coincidencia fiable. */
export async function enrichItem(raw, language, avoid, lookupFood) {
  const item = {
    name: String(raw.name || LANGS[language].food).slice(0, 80),
    grams: Math.round(clampNum(raw.grams, 1, 3000, 100)),
    calories: Math.round(clampNum(raw.calories, 0, 5000)),
    protein_g: Math.round(clampNum(raw.protein_g, 0, 500)),
    carbs_g: Math.round(clampNum(raw.carbs_g, 0, 1000)),
    fat_g: Math.round(clampNum(raw.fat_g, 0, 500)),
    confidence: clampNum(raw.confidence, 0, 1, 0.5),
    source: "ai",
    matched_name: null,
    may_contain: filterMayContain(raw.may_contain, avoid),
  };

  const match = await lookupFood({
    search_query_en: raw.search_query_en,
    name: item.name,
    is_packaged: Boolean(raw.is_packaged),
    grams: item.grams,
    calories: item.calories,
  });
  if (match) {
    const factor = item.grams / 100;
    item.calories = Math.round(match.kcal100 * factor);
    item.protein_g = Math.round(match.protein100 * factor);
    item.carbs_g = Math.round(match.carbs100 * factor);
    item.fat_g = Math.round(match.fat100 * factor);
    item.source = match.source; // "usda" | "off"
    item.matched_name = match.matchedName;
    applyExtras(item, match, factor);
  }
  return item;
}

/**
 * Margen de calorías: depende de lo seguro que está el modelo y de cuántos datos vienen de la base de
 * datos. Siempre queda un margen mínimo, porque el peso de las raciones nunca se conoce con exactitud.
 */
export function calorieRange(items) {
  const total = items.reduce((sum, item) => sum + item.calories, 0);
  if (total === 0) return { min: 0, max: 0 };
  let weighted = 0;
  for (const item of items) {
    const dbBonus = item.source === "ai" ? 0 : 0.04;
    const margin = Math.min(0.4, Math.max(0.08, 0.1 + (1 - item.confidence) * 0.3 - dbBonus));
    weighted += item.calories * margin;
  }
  const margin = weighted / total;
  return { min: Math.round(total * (1 - margin)), max: Math.round(total * (1 + margin)) };
}

export const emptyResult = (notes = "") => ({ is_food: false, dish_name: "", items: [], total_calories_min: 0, total_calories_max: 0, notes });

/** Convierte el análisis de la IA en el resultado que espera la app. */
export async function buildResult(parsed, language, avoid, lookupFood) {
  if (!parsed.is_food || parsed.items.length === 0) return emptyResult(parsed.notes || "");
  const items = await Promise.all(parsed.items.slice(0, 15).map((item) => enrichItem(item, language, avoid, lookupFood)));
  const range = calorieRange(items);
  return {
    is_food: true,
    dish_name: String(parsed.dish_name || LANGS[language].meal).slice(0, 80),
    items,
    total_calories_min: range.min,
    total_calories_max: range.max,
    notes: String(parsed.notes || ""),
  };
}
