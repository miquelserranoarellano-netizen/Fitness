import { describe, expect, test } from "vitest";
import { ApiError, apiErrorMessage, createApiClient, isRetryable, mealWarnings, resolveApiUrl, type ApiErrorCode } from "./api";

type Call = { url: string; init: RequestInit };

/** `fetch` falso: guarda las llamadas y responde lo que se le diga. */
function fakeFetch(reply: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = async (url: string | URL | Request, init: RequestInit = {}) => {
    const call = { url: String(url), init };
    calls.push(call);
    return reply(call);
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const serverResult = {
  is_food: true,
  dish_name: "Tostada con huevo",
  items: [
    {
      name: "Pan",
      grams: 60,
      calories: 180,
      protein_g: 6,
      carbs_g: 33,
      fat_g: 2,
      fiber_g: 1.8,
      sugar_g: 3,
      sodium_mg: 300,
      confidence: 0.8,
      source: "usda",
      matched_name: "Bread, toasted",
      may_contain: ["gluten"],
    },
    { name: "Huevo frito", grams: 50, calories: 90, protein_g: 6, carbs_g: 0, fat_g: 7, confidence: 0.9, source: "ai", matched_name: null, may_contain: ["huevo", "gluten"] },
  ],
  total_calories_min: 240,
  total_calories_max: 300,
  notes: "",
  campo_nuevo: "se ignora",
};

/** Ejecuta la promesa y devuelve el `ApiError` con el que falla. */
async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("Se esperaba un error");
}

describe("peticiones", () => {
  test("analiza texto: manda idioma, alergias y token, y traduce la respuesta", async () => {
    const { calls, fetch } = fakeFetch(() => json(serverResult));
    const api = createApiClient({ baseUrl: "http://192.168.1.20:3000/", appToken: "secreto", fetch });
    const result = await api.analyzeText("una tostada con huevo", { language: "fr", avoid: ["gluten"] });

    expect(calls[0].url).toBe("http://192.168.1.20:3000/analyze-text");
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>)["x-app-token"]).toBe("secreto");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ text: "una tostada con huevo", language: "fr", avoid: ["gluten"] });

    expect(result.isFood).toBe(true);
    expect(result.caloriesMin).toBe(240);
    expect(result.per100g).toBeNull();
    expect(result.items[0]).toEqual({
      name: "Pan",
      grams: 60,
      calories: 180,
      proteinG: 6,
      carbsG: 33,
      fatG: 2,
      fiberG: 1.8,
      sugarG: 3,
      sodiumMg: 300,
      dataSource: "usda",
      matchedName: "Bread, toasted",
      confidence: 0.8,
      mayContain: ["gluten"],
    });
    expect(result.items[1].fiberG).toBeNull();
    expect(mealWarnings(result)).toEqual(["gluten", "huevo"]);
  });

  test("sin token no manda la cabecera; el idioma por defecto es el de la app", async () => {
    const { calls, fetch } = fakeFetch(() => json(serverResult));
    const api = createApiClient({ baseUrl: "http://localhost:3000", fetch });
    await api.analyzePhoto({ base64: "QUJD", mediaType: "image/jpeg" });
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["x-app-token"]).toBeUndefined();
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ imageBase64: "QUJD", mediaType: "image/jpeg", language: "es", avoid: [] });
  });

  test("código de barras: GET con el idioma y valores por 100 g", async () => {
    const { calls, fetch } = fakeFetch(() =>
      json({
        ...serverResult,
        items: [serverResult.items[0]],
        per_100g: { calories: 300, protein_g: 10, carbs_g: 55, fat_g: 4, fiber_g: null, sugar_g: 5, sodium_mg: 500 },
        serving_grams: 60,
      }),
    );
    const api = createApiClient({ baseUrl: "http://localhost:3000", fetch });
    const result = await api.lookupBarcode(" 8410000000017 ", { language: "de" });
    expect(calls[0].url).toBe("http://localhost:3000/barcode/8410000000017?language=de");
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.body).toBeUndefined();
    expect(result.per100g).toEqual({ calories: 300, proteinG: 10, carbsG: 55, fatG: 4, fiberG: null, sugarG: 5, sodiumMg: 500 });
    expect(result.servingGrams).toBe(60);
  });

  test("acepta una respuesta real del servidor (código de barras de Nutella)", async () => {
    const real = {
      is_food: true,
      dish_name: "Nutella",
      items: [{ name: "Nutella", grams: 100, calories: 539, protein_g: 6, carbs_g: 58, fat_g: 31, confidence: 1, source: "off", matched_name: "Nutella", may_contain: [], fiber_g: 0, sugar_g: 56.3, sodium_mg: 43 }],
      total_calories_min: 512,
      total_calories_max: 566,
      notes: "",
      per_100g: { calories: 539, protein_g: 6.3, carbs_g: 57.5, fat_g: 30.9, fiber_g: 0, sugar_g: 56.3, sodium_mg: 42.8 },
      serving_grams: null,
    };
    const { fetch } = fakeFetch(() => json(real));
    const result = await createApiClient({ baseUrl: "http://localhost:3000", fetch }).lookupBarcode("3017620422003");
    expect(result.items[0]).toMatchObject({ calories: 539, fiberG: 0, dataSource: "off" });
    expect(result.servingGrams).toBeNull();
  });

  test("salud", async () => {
    const { fetch } = fakeFetch(() => json({ ok: true, ai: false }));
    expect(await createApiClient({ baseUrl: "http://localhost:3000", fetch }).health()).toEqual({ ok: true, ai: false });
  });
});

describe("errores", () => {
  test("usa el código del servidor", async () => {
    const { fetch } = fakeFetch(() => json({ code: "ai_not_configured", error: "Falta la clave" }, 503));
    const error = await failure(createApiClient({ baseUrl: "http://localhost:3000", fetch }).analyzeText("lentejas"));
    expect(error.code).toBe("ai_not_configured");
    expect(error.status).toBe(503);
    expect(isRetryable(error)).toBe(false);
  });

  test("sin código conocido: 401 es unauthorized; el resto, http con el estado", async () => {
    const unauthorized = fakeFetch(() => new Response("no", { status: 401 }));
    expect((await failure(createApiClient({ baseUrl: "http://x.local:3000", fetch: unauthorized.fetch }).health())).code).toBe("unauthorized");
    const proxy = fakeFetch(() => new Response("<html>Bad gateway</html>", { status: 502 }));
    const error = await failure(createApiClient({ baseUrl: "http://x.local:3000", fetch: proxy.fetch }).health());
    expect([error.code, error.status]).toEqual(["http", 502]);
    expect(apiErrorMessage(error)).toBe("Error del servidor (502).");
  });

  test("sin red, con la dirección en el mensaje", async () => {
    const { fetch } = fakeFetch(() => {
      throw new TypeError("Network request failed");
    });
    const error = await failure(createApiClient({ baseUrl: "http://192.168.1.20:3000", fetch }).analyzeText("lentejas"));
    expect(error.code).toBe("network");
    expect(apiErrorMessage(error)).toContain("http://192.168.1.20:3000");
    expect(isRetryable(error)).toBe(true);
  });

  /** Un servidor que no responde nunca (hasta que se cancela la petición). */
  const hanging = () =>
    fakeFetch(
      ({ init }) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );

  test("tiempo agotado", async () => {
    const { fetch } = hanging();
    const api = createApiClient({ baseUrl: "http://localhost:3000", fetch, timeouts: { analysis: 20 } });
    expect((await failure(api.analyzeText("lentejas"))).code).toBe("timeout");
  });

  test("cancelada por la pantalla", async () => {
    const { fetch, calls } = hanging();
    const api = createApiClient({ baseUrl: "http://localhost:3000", fetch });
    const controller = new AbortController();
    const pending = api.analyzeText("lentejas", { signal: controller.signal });
    controller.abort();
    expect((await failure(pending)).code).toBe("cancelled");

    // Ya cancelada antes de empezar: ni siquiera se llama al servidor.
    expect((await failure(api.analyzeText("lentejas", { signal: controller.signal }))).code).toBe("cancelled");
    expect(calls).toHaveLength(1);
  });

  test("respuesta con otra forma o que no es JSON", async () => {
    const wrongShape = fakeFetch(() => json({ is_food: "sí" }));
    expect((await failure(createApiClient({ baseUrl: "http://localhost:3000", fetch: wrongShape.fetch }).analyzeText("x"))).code).toBe("bad_response");
    const notJson = fakeFetch(() => new Response("hola", { status: 200 }));
    expect((await failure(createApiClient({ baseUrl: "http://localhost:3000", fetch: notJson.fetch }).health())).code).toBe("bad_response");
  });

  test("sin dirección del servidor no se intenta nada", async () => {
    const { fetch, calls } = fakeFetch(() => json(serverResult));
    expect((await failure(createApiClient({ baseUrl: "  ", fetch }).analyzeText("x"))).code).toBe("no_server");
    expect(calls).toHaveLength(0);
  });

  test("todos los códigos tienen mensaje", () => {
    const codes: ApiErrorCode[] = [
      "no_server", "network", "timeout", "cancelled", "bad_response", "prepare", "http",
      "ai_not_configured", "ai_auth_failed", "ai_busy", "ai_bad_request", "ai_unavailable", "ai_timeout",
      "ai_refused", "ai_invalid_response", "rate_limited", "unauthorized", "bad_request", "too_large",
      "not_found", "lookup_unavailable", "server_error",
    ];
    for (const code of codes) {
      const text = apiErrorMessage(new ApiError(code, { url: "http://a", status: 500 }));
      expect(text.length, code).toBeGreaterThan(5);
      expect(text, code).not.toMatch(/\{\w+\}/);
    }
    expect(apiErrorMessage(new Error("otra cosa"))).toBe("otra cosa");
  });
});

describe("dirección del servidor", () => {
  test("la configurada manda", () => {
    expect(resolveApiUrl({ configured: " https://api.ejemplo.com/ ", devHost: "192.168.1.20:8081" })).toBe("https://api.ejemplo.com");
  });

  test("en desarrollo, el ordenador de Metro o de la web en el puerto 3000", () => {
    expect(resolveApiUrl({ devHost: "192.168.1.20:8081" })).toBe("http://192.168.1.20:3000");
    expect(resolveApiUrl({ devHost: "localhost" })).toBe("http://localhost:3000");
    expect(resolveApiUrl({ devHost: "mi-pc.local:8081", port: 4000 })).toBe("http://mi-pc.local:4000");
    expect(resolveApiUrl({ configured: "", devHost: "exp://10.0.0.5:8081/--/inicio" })).toBe("http://10.0.0.5:3000");
  });

  test("con túnel o sin nada, vacía", () => {
    expect(resolveApiUrl({ devHost: "abc-anonymous-8081.exp.direct" })).toBe("");
    expect(resolveApiUrl({})).toBe("");
  });
});
