// Rutas del servidor con un cliente de Anthropic falso y bases de datos falsas: sin red ni claves.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import { createApp } from "../src/app.js";
import { ANALYSIS_SCHEMA, buildSystemPrompt, calorieRange, cleanAvoidList, mapAnthropicError } from "../src/analysis.js";
import { LookupUnavailableError } from "../src/nutrition.js";

const silent = { warn() {}, error() {}, log() {} };
const servers = [];
after(() => Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve)))));

/** Arranca la app en un puerto libre y devuelve una función para hacerle peticiones. */
async function start(options = {}) {
  const app = createApp({
    lookupFood: async () => null,
    lookupBarcode: async () => null,
    logger: silent,
    ...options,
  });
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  servers.push(server);
  const base = `http://127.0.0.1:${server.address().port}`;
  return async (path, { method = "GET", body, headers = {} } = {}) => {
    const response = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
}

const analysis = {
  is_food: true,
  dish_name: "Tostada con huevo",
  items: [
    {
      name: "Pan",
      search_query_en: "bread toasted",
      is_packaged: false,
      grams: 60,
      calories: 160,
      protein_g: 5,
      carbs_g: 30,
      fat_g: 2,
      confidence: 0.8,
      may_contain: ["Gluten", "inventado"],
    },
    {
      name: "Huevo frito",
      search_query_en: "egg fried",
      is_packaged: false,
      grams: 50,
      calories: 90,
      protein_g: 6,
      carbs_g: 0,
      fat_g: 7,
      confidence: 0.9,
      may_contain: ["huevo"],
    },
  ],
  notes: "",
};

/** Cliente falso: guarda la petición y devuelve lo que se le diga. */
function fakeClient(reply) {
  const requests = [];
  return {
    requests,
    beta: {
      messages: {
        create: async (params, options) => {
          requests.push({ params, options });
          if (reply instanceof Error) throw reply;
          return typeof reply === "function" ? reply(params) : reply;
        },
      },
    },
  };
}

const message = (json, stop_reason = "end_turn") => ({
  stop_reason,
  content: [
    { type: "thinking", thinking: "…", signature: "x" },
    { type: "text", text: typeof json === "string" ? json : JSON.stringify(json) },
  ],
});

describe("salud", () => {
  test("dice si la IA está configurada", async () => {
    assert.deepEqual((await (await start())("/health")).body, { ok: true, ai: false });
    assert.equal((await (await start({ client: fakeClient(message(analysis)) }))("/health")).body.ai, true);
  });
});

describe("análisis de texto y foto", () => {
  test("sin clave de Anthropic responde ai_not_configured", async () => {
    const request = await start();
    const { status, body } = await request("/analyze-text", { method: "POST", body: { text: "dos huevos" } });
    assert.equal(status, 503);
    assert.equal(body.code, "ai_not_configured");
  });

  test("pide salida estructurada con reintento en otro modelo y mezcla las cifras de la base de datos", async () => {
    const client = fakeClient(message(analysis));
    const lookupFood = async (item) =>
      item.search_query_en === "bread toasted"
        ? { source: "usda", matchedName: "Bread, toasted", kcal100: 300, protein100: 10, carbs100: 55, fat100: 4, fiber100: 3, sugar100: 5, sodium100: 500 }
        : null;
    const request = await start({ client, lookupFood, model: "claude-sonnet-5-5" });
    const { status, body } = await request("/analyze-text", {
      method: "POST",
      body: { text: "  una tostada con un huevo frito  ", language: "es", avoid: ["gluten", "Huevo", 7, "gluten"] },
    });
    assert.equal(status, 200);

    const { params, options } = client.requests[0];
    assert.equal(params.model, "claude-sonnet-5-5");
    assert.equal(params.fallbacks, "default");
    assert.deepEqual(params.betas, ["server-side-fallback-2026-07-01"]);
    assert.equal(params.output_config.format.type, "json_schema");
    assert.equal(params.output_config.effort, undefined);
    assert.equal(params.messages[0].content[0].text, "Comida: una tostada con un huevo frito");
    assert.match(params.system, /El usuario evita: gluten; Huevo\./);
    assert.equal(options.timeout > 0, true);

    const [bread, egg] = body.items;
    assert.equal(bread.source, "usda");
    assert.equal(bread.calories, 180); // 60 g × 300 kcal/100 g
    assert.equal(bread.fiber_g, 1.8);
    assert.equal(bread.sodium_mg, 300);
    assert.deepEqual(bread.may_contain, ["gluten"]); // solo lo que está en la lista, con su forma
    assert.equal(egg.source, "ai");
    assert.equal(egg.calories, 90);
    assert.deepEqual(egg.may_contain, ["Huevo"]);
    assert.equal(body.dish_name, "Tostada con huevo");
    assert.ok(body.total_calories_min < 270 && body.total_calories_max > 270);
  });

  test("la foto llega como bloque de imagen y el esfuerzo se pasa si está configurado", async () => {
    const client = fakeClient(message({ is_food: false, dish_name: "", items: [], notes: "No es comida" }));
    const request = await start({ client, effort: "medium" });
    const imageBase64 = "A".repeat(400);
    const { status, body } = await request("/analyze", {
      method: "POST",
      body: { imageBase64: `data:image/png;base64,${imageBase64}`, mediaType: "image/png", language: "fr" },
    });
    assert.equal(status, 200);
    assert.equal(body.is_food, false);
    assert.equal(body.notes, "No es comida");
    const { params } = client.requests[0];
    assert.equal(params.output_config.effort, "medium");
    assert.deepEqual(params.messages[0].content[0].source, { type: "base64", media_type: "image/png", data: imageBase64 });
    assert.match(params.system, /francés/);
    assert.match(params.system, /Deja "may_contain" vacío/);
  });

  test("rechaza peticiones mal formadas sin llamar a la IA", async () => {
    const client = fakeClient(message(analysis));
    const request = await start({ client });
    for (const body of [{}, { imageBase64: "corta" }, { imageBase64: "A".repeat(400), mediaType: "image/gif" }, { imageBase64: "%".repeat(400) }]) {
      const response = await request("/analyze", { method: "POST", body });
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.equal(response.body.code, "bad_request");
    }
    assert.equal((await request("/analyze-text", { method: "POST", body: { text: " a " } })).status, 400);
    assert.equal((await request("/analyze-text", { method: "POST", body: "{no es json" })).status, 400);
    assert.equal(client.requests.length, 0);
  });

  test("una imagen enorme responde too_large", async () => {
    const request = await start({ client: fakeClient(message(analysis)) });
    const { status, body } = await request("/analyze", { method: "POST", body: { imageBase64: "A".repeat(9_000_000) } });
    assert.equal(status, 413);
    assert.equal(body.code, "too_large");
  });

  test("negativa, respuesta cortada o mal formada", async () => {
    const cases = [
      [message("", "refusal"), 422, "ai_refused"],
      [message('{"is_food": tr', "max_tokens"), 502, "ai_invalid_response"],
      [message("no es json"), 502, "ai_invalid_response"],
      [message({ is_food: "sí" }), 502, "ai_invalid_response"],
    ];
    for (const [reply, status, code] of cases) {
      const request = await start({ client: fakeClient(reply) });
      const response = await request("/analyze-text", { method: "POST", body: { text: "lentejas" } });
      assert.equal(response.status, status, code);
      assert.equal(response.body.code, code);
    }
  });

  test("los errores del SDK se convierten en códigos de la app", async () => {
    const cases = [
      [new Anthropic.RateLimitError(429, undefined, "rate", new Headers()), 429, "ai_busy"],
      [new Anthropic.AuthenticationError(401, undefined, "auth", new Headers()), 503, "ai_auth_failed"],
      [new Anthropic.InternalServerError(529, undefined, "overloaded", new Headers()), 503, "ai_unavailable"],
      [new Anthropic.APIConnectionTimeoutError(), 504, "ai_timeout"],
      [new Anthropic.APIConnectionError({ message: "sin red" }), 503, "ai_unavailable"],
      [new TypeError("fallo raro"), 500, "server_error"],
    ];
    for (const [error, status, code] of cases) {
      const request = await start({ client: fakeClient(error) });
      const response = await request("/analyze-text", { method: "POST", body: { text: "lentejas" } });
      assert.equal(response.status, status, code);
      assert.equal(response.body.code, code);
    }
    assert.equal(mapAnthropicError(new Anthropic.APIConnectionTimeoutError()).code, "ai_timeout");
  });
});

describe("token y límite de peticiones", () => {
  test("con APP_TOKEN hace falta la cabecera x-app-token (salud queda libre)", async () => {
    const request = await start({ client: fakeClient(message(analysis)), appToken: "secreto" });
    assert.equal((await request("/health")).status, 200);
    const denied = await request("/analyze-text", { method: "POST", body: { text: "lentejas" } });
    assert.equal(denied.status, 401);
    assert.equal(denied.body.code, "unauthorized");
    assert.equal((await request("/barcode/12345678", { headers: { "x-app-token": "otro" } })).status, 401);
    const allowed = await request("/analyze-text", { method: "POST", body: { text: "lentejas" }, headers: { "x-app-token": "secreto" } });
    assert.equal(allowed.status, 200);
  });

  test("pasado el límite responde rate_limited", async () => {
    const request = await start({ rateLimitPerMinute: 2 });
    await request("/barcode/12345678");
    await request("/barcode/12345678");
    const third = await request("/barcode/12345678");
    assert.equal(third.status, 429);
    assert.equal(third.body.code, "rate_limited");
  });
});

describe("código de barras", () => {
  const product = {
    name: "Galletas",
    brand: "Marca",
    servingGrams: 30,
    per100: { kcal100: 450, protein100: 6, carbs100: 70, fat100: 16, fiber100: 3, sugar100: 20, sodium100: 500 },
  };

  test("devuelve la ración y los valores por 100 g", async () => {
    const request = await start({ lookupBarcode: async (code) => (code === "8410000000017" ? product : null) });
    const { status, body } = await request("/barcode/8410000000017?language=en");
    assert.equal(status, 200);
    assert.equal(body.dish_name, "Galletas · Marca");
    assert.equal(body.items[0].grams, 30);
    assert.equal(body.items[0].calories, 135);
    assert.equal(body.items[0].sodium_mg, 150);
    assert.equal(body.per_100g.calories, 450);
    assert.equal(body.serving_grams, 30);
    assert.deepEqual([body.total_calories_min, body.total_calories_max], [128, 142]);
  });

  test("no repite la marca si ya está en el nombre", async () => {
    const request = await start({ lookupBarcode: async () => ({ ...product, name: "Nutella", brand: "nutella" }) });
    assert.equal((await request("/barcode/3017620422003")).body.dish_name, "Nutella");
  });

  test("no encontrado, base de datos caída y código no válido", async () => {
    assert.equal((await (await start())("/barcode/8410000000999")).body.code, "not_found");
    const down = await (await start({ lookupBarcode: async () => { throw new LookupUnavailableError("caído"); } }))("/barcode/8410000000017");
    assert.deepEqual([down.status, down.body.code], [502, "lookup_unavailable"]);
    const invalid = await (await start())("/barcode/12ab");
    assert.deepEqual([invalid.status, invalid.body.code], [400, "bad_request"]);
  });
});

describe("piezas del análisis", () => {
  test("el esquema cumple lo que pide la salida estructurada", () => {
    const visit = (schema) => {
      if (schema.type === "object") {
        assert.equal(schema.additionalProperties, false);
        assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort());
        Object.values(schema.properties).forEach(visit);
      }
      if (schema.type === "array") visit(schema.items);
      for (const unsupported of ["minimum", "maximum", "minLength", "maxLength"]) assert.equal(schema[unsupported], undefined);
    };
    visit(ANALYSIS_SCHEMA);
  });

  test("la lista de cosas que se evitan se limpia", () => {
    assert.deepEqual(cleanAvoidList(["  Lactosa ", "lactosa", "", null, "x".repeat(60)]), ["Lactosa", "x".repeat(40)]);
    assert.deepEqual(cleanAvoidList("gluten"), []);
    assert.equal(cleanAvoidList(Array.from({ length: 30 }, (_, i) => `a${i}`)).length, 20);
  });

  test("las instrucciones cambian según foto o texto", () => {
    assert.match(buildSystemPrompt("es", "image", []), /referencias visuales/);
    assert.match(buildSystemPrompt("de", "text", []), /alemán/);
  });

  test("el margen de calorías nunca baja del 8 %", () => {
    const range = calorieRange([{ calories: 100, confidence: 1, source: "usda" }]);
    assert.deepEqual(range, { min: 92, max: 108 });
    assert.deepEqual(calorieRange([]), { min: 0, max: 0 });
  });
});
