import { z } from "zod";
import { getLanguage, msg, t, type Language } from "@/i18n";

/**
 * Cliente del servidor (`server/` en la raíz del repositorio): análisis de fotos y textos de comida con
 * IA y búsqueda por código de barras. La clave de Anthropic vive solo en el servidor; la app nunca la ve.
 *
 * Este módulo no depende de Expo ni de React Native, así que se prueba con vitest: la configuración
 * (dirección del servidor, token) está en `api-config.ts` y la preparación de fotos en `photo-prep.ts`.
 *
 * Todas las respuestas se validan con Zod. Cualquier fallo se convierte en un `ApiError` con un código
 * estable; `apiErrorMessage` lo traduce a un texto para el usuario.
 */

export const DEFAULT_SERVER_PORT = 3000;

/** Códigos que devuelve el servidor en `{ code, error }`. */
const SERVER_ERROR_CODES = [
  "ai_not_configured",
  "ai_auth_failed",
  "ai_busy",
  "ai_bad_request",
  "ai_unavailable",
  "ai_timeout",
  "ai_refused",
  "ai_invalid_response",
  "rate_limited",
  "unauthorized",
  "bad_request",
  "too_large",
  "not_found",
  "lookup_unavailable",
  "server_error",
] as const;
type ServerErrorCode = (typeof SERVER_ERROR_CODES)[number];

/** Los del servidor y los que se detectan en el teléfono. */
export type ApiErrorCode =
  | ServerErrorCode
  /** No hay dirección del servidor (ver `api-config.ts`). */
  | "no_server"
  /** El teléfono no llega al servidor. */
  | "network"
  /** El servidor no ha respondido a tiempo. */
  | "timeout"
  /** Lo ha cancelado la pantalla (el usuario salió). */
  | "cancelled"
  /** El servidor ha respondido algo que no se entiende (versiones distintas). */
  | "bad_response"
  /** No se ha podido preparar la foto. */
  | "prepare"
  /** Error HTTP sin código conocido. */
  | "http";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number | null;
  readonly url: string | null;

  constructor(code: ApiErrorCode, info: { status?: number; url?: string; detail?: string } = {}) {
    super(info.detail ? `${code}: ${info.detail}` : code);
    this.name = "ApiError";
    this.code = code;
    this.status = info.status ?? null;
    this.url = info.url ?? null;
  }
}

/* ───────────────────────────── Respuestas ───────────────────────────── */

const itemSchema = z.object({
  name: z.string(),
  grams: z.number(),
  calories: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  fiber_g: z.number().optional(),
  sugar_g: z.number().optional(),
  sodium_mg: z.number().optional(),
  confidence: z.number(),
  source: z.enum(["usda", "off", "ai"]),
  matched_name: z.string().nullable(),
  may_contain: z.array(z.string()).default([]),
});

const per100Schema = z.object({
  calories: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  fiber_g: z.number().nullable(),
  sugar_g: z.number().nullable(),
  sodium_mg: z.number().nullable(),
});

const resultSchema = z.object({
  is_food: z.boolean(),
  dish_name: z.string(),
  items: z.array(itemSchema),
  total_calories_min: z.number(),
  total_calories_max: z.number(),
  notes: z.string(),
  per_100g: per100Schema.optional(),
  serving_grams: z.number().nullable().optional(),
});

const healthSchema = z.object({ ok: z.boolean(), ai: z.boolean() });

/** Un alimento reconocido. Encaja con `IncomingFoodItem` (`integrations/nutrition/contract.ts`). */
export type AnalyzedFood = {
  name: string;
  grams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
  /** De dónde salen las cifras: USDA, Open Food Facts o la estimación de la IA. */
  dataSource: "usda" | "off" | "ai";
  matchedName: string | null;
  confidence: number;
  /** Cosas que el usuario evita y que este alimento podría contener (aviso, no diagnóstico). */
  mayContain: string[];
};

export type Per100g = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
};

/** Resultado de analizar una foto, un texto o un código de barras. */
export type MealAnalysis = {
  /** false si no se ha reconocido comida (la lista viene vacía). */
  isFood: boolean;
  dishName: string;
  items: AnalyzedFood[];
  /** Margen de la estimación: la foto nunca da un peso exacto. */
  caloriesMin: number;
  caloriesMax: number;
  notes: string;
  /** Solo en códigos de barras: valores por 100 g para recalcular si cambias la cantidad. */
  per100g: Per100g | null;
  /** Solo en códigos de barras: la ración de la etiqueta, si la trae. */
  servingGrams: number | null;
};

export type ServerHealth = { ok: boolean; ai: boolean };

const orNull = (value: number | null | undefined) => value ?? null;

function toAnalysis(raw: z.infer<typeof resultSchema>): MealAnalysis {
  return {
    isFood: raw.is_food,
    dishName: raw.dish_name,
    items: raw.items.map((item) => ({
      name: item.name,
      grams: item.grams,
      calories: item.calories,
      proteinG: item.protein_g,
      carbsG: item.carbs_g,
      fatG: item.fat_g,
      fiberG: orNull(item.fiber_g),
      sugarG: orNull(item.sugar_g),
      sodiumMg: orNull(item.sodium_mg),
      dataSource: item.source,
      matchedName: item.matched_name,
      confidence: item.confidence,
      mayContain: item.may_contain,
    })),
    caloriesMin: raw.total_calories_min,
    caloriesMax: raw.total_calories_max,
    notes: raw.notes,
    per100g: raw.per_100g
      ? {
          calories: raw.per_100g.calories,
          proteinG: raw.per_100g.protein_g,
          carbsG: raw.per_100g.carbs_g,
          fatG: raw.per_100g.fat_g,
          fiberG: raw.per_100g.fiber_g,
          sugarG: raw.per_100g.sugar_g,
          sodiumMg: raw.per_100g.sodium_mg,
        }
      : null,
    servingGrams: orNull(raw.serving_grams),
  };
}

/** Lo que dice la IA que podría contener la comida entera, sin repetir. */
export function mealWarnings(analysis: MealAnalysis): string[] {
  return [...new Set(analysis.items.flatMap((item) => item.mayContain))];
}

/* ───────────────────────────── Dirección del servidor ───────────────────────────── */

const isLocalNetworkHost = (host: string) =>
  host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.endsWith(".local");

/**
 * Dirección del servidor:
 * 1. La configurada (`EXPO_PUBLIC_API_URL`), si hay.
 * 2. En desarrollo, el mismo ordenador que sirve la app (el de Metro o la web) en el puerto 3000. Solo
 *    si es una dirección de la red local: con `--tunnel` el servidor no es accesible y hay que
 *    configurarlo.
 * 3. Si no, vacía: las peticiones fallan con `no_server`.
 */
export function resolveApiUrl({
  configured,
  devHost,
  port = DEFAULT_SERVER_PORT,
}: {
  configured?: string | null;
  devHost?: string | null;
  port?: number;
}): string {
  const explicit = configured?.trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  const host = devHost
    ?.trim()
    .replace(/^[a-z]+:\/\//i, "")
    .split("/")[0]
    .replace(/:\d+$/, "");
  return host && isLocalNetworkHost(host) ? `http://${host}:${port}` : "";
}

/* ───────────────────────────── Cliente ───────────────────────────── */

export type ApiClientOptions = {
  baseUrl: string;
  /** El mismo valor que `APP_TOKEN` en `server/.env`. Vacío si el servidor no lo pide. */
  appToken?: string;
  fetch?: typeof fetch;
  /** Milisegundos. Un análisis con IA puede tardar: el servidor espera hasta ~100 s a Claude. */
  timeouts?: Partial<Record<"analysis" | "lookup" | "health", number>>;
};

export type RequestOptions = {
  /** Para cancelar si el usuario sale de la pantalla. */
  signal?: AbortSignal;
  /** Idioma de los nombres de los alimentos. Por defecto, el de la app. */
  language?: Language;
};

export type AnalysisOptions = RequestOptions & {
  /** Alergias y alimentos que el usuario evita: la IA avisa si la comida podría contenerlos. */
  avoid?: readonly string[];
};

/** Foto ya preparada para enviarla (ver `photo-prep.ts`). */
export type PhotoPayload = { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" };

const DEFAULT_TIMEOUTS = { analysis: 115_000, lookup: 20_000, health: 8_000 };

const errorBodySchema = z.object({ code: z.string().optional(), error: z.string().optional() });

function serverCode(value: unknown): ServerErrorCode | null {
  return SERVER_ERROR_CODES.includes(value as ServerErrorCode) ? (value as ServerErrorCode) : null;
}

export function createApiClient(options: ApiClientOptions) {
  const baseUrl = options.baseUrl.trim().replace(/\/+$/, "");
  const fetchImpl = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const timeouts = { ...DEFAULT_TIMEOUTS, ...options.timeouts };

  async function request(
    path: string,
    { method, body, timeoutMs, signal }: { method: "GET" | "POST"; body?: unknown; timeoutMs: number; signal?: AbortSignal },
  ): Promise<unknown> {
    if (!baseUrl) throw new ApiError("no_server");
    if (signal?.aborted) throw new ApiError("cancelled", { url: baseUrl });

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel);

    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (options.appToken) headers["x-app-token"] = options.appToken;

    let response: Response;
    let payload: unknown;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      payload = await response.json().catch(() => undefined);
    } catch (error) {
      if (timedOut) throw new ApiError("timeout", { url: baseUrl });
      if (signal?.aborted) throw new ApiError("cancelled", { url: baseUrl });
      throw new ApiError("network", { url: baseUrl, detail: error instanceof Error ? error.message : String(error) });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }

    if (!response.ok) {
      const parsed = errorBodySchema.safeParse(payload);
      const known = serverCode(parsed.success ? parsed.data.code : undefined);
      const code: ApiErrorCode = known ?? (response.status === 401 ? "unauthorized" : "http");
      throw new ApiError(code, { status: response.status, url: baseUrl, detail: parsed.success ? parsed.data.error : undefined });
    }
    return payload;
  }

  async function analysis(path: string, init: { method: "GET" | "POST"; body?: unknown; timeoutMs: number; signal?: AbortSignal }) {
    const parsed = resultSchema.safeParse(await request(path, init));
    if (!parsed.success) throw new ApiError("bad_response", { url: baseUrl, detail: parsed.error.issues[0]?.message });
    return toAnalysis(parsed.data);
  }

  return {
    baseUrl,

    /** ¿Responde el servidor? ¿Tiene la IA configurada? */
    async health(options: { signal?: AbortSignal } = {}): Promise<ServerHealth> {
      const parsed = healthSchema.safeParse(await request("/health", { method: "GET", timeoutMs: timeouts.health, signal: options.signal }));
      if (!parsed.success) throw new ApiError("bad_response", { url: baseUrl });
      return parsed.data;
    },

    /** Reconoce los alimentos de una foto. */
    analyzePhoto(photo: PhotoPayload, options: AnalysisOptions = {}): Promise<MealAnalysis> {
      return analysis("/analyze", {
        method: "POST",
        body: {
          imageBase64: photo.base64,
          mediaType: photo.mediaType,
          language: options.language ?? getLanguage(),
          avoid: options.avoid ?? [],
        },
        timeoutMs: timeouts.analysis,
        signal: options.signal,
      });
    },

    /** Interpreta lo que has comido escrito («2 huevos y una tostada»). */
    analyzeText(text: string, options: AnalysisOptions = {}): Promise<MealAnalysis> {
      return analysis("/analyze-text", {
        method: "POST",
        body: { text, language: options.language ?? getLanguage(), avoid: options.avoid ?? [] },
        timeoutMs: timeouts.analysis,
        signal: options.signal,
      });
    },

    /** Producto envasado por código de barras. Si no existe, `ApiError` con código `not_found`. */
    lookupBarcode(code: string, options: RequestOptions = {}): Promise<MealAnalysis> {
      const query = new URLSearchParams({ language: options.language ?? getLanguage() });
      return analysis(`/barcode/${encodeURIComponent(code.trim())}?${query}`, {
        method: "GET",
        timeoutMs: timeouts.lookup,
        signal: options.signal,
      });
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/* ───────────────────────────── Mensajes ───────────────────────────── */

const MESSAGES: Record<ApiErrorCode, string> = {
  no_server: msg("Falta la dirección del servidor. Configúrala en EXPO_PUBLIC_API_URL (app/.env)."),
  network: msg("No se puede conectar con el servidor ({url}). Comprueba que está encendido y que el móvil está en la misma red."),
  timeout: msg("El servidor ha tardado demasiado en responder. Prueba otra vez."),
  cancelled: msg("Cancelado."),
  bad_response: msg("El servidor ha respondido algo inesperado. Comprueba que la app y el servidor están actualizados."),
  prepare: msg("No se ha podido preparar la foto. Prueba con otra."),
  http: msg("Error del servidor ({status})."),
  ai_not_configured: msg("El servidor no tiene la clave de Anthropic (ANTHROPIC_API_KEY en server/.env). Mientras, puedes añadir la comida a mano o con el código de barras."),
  ai_auth_failed: msg("La clave de Anthropic del servidor no es válida."),
  ai_busy: msg("La IA está saturada. Prueba en un momento."),
  ai_bad_request: msg("El servidor no ha podido preparar la petición a la IA."),
  ai_unavailable: msg("La IA no está disponible ahora mismo. Prueba en un momento."),
  ai_timeout: msg("La IA ha tardado demasiado. Prueba otra vez."),
  ai_refused: msg("La IA no ha podido analizar esto. Prueba con otra foto o escríbelo."),
  ai_invalid_response: msg("La IA ha devuelto una respuesta incompleta. Prueba otra vez."),
  rate_limited: msg("Demasiadas peticiones seguidas. Espera un minuto."),
  unauthorized: msg("El servidor ha rechazado la app: el token (APP_TOKEN y EXPO_PUBLIC_APP_TOKEN) no coincide."),
  bad_request: msg("El servidor no ha entendido la petición."),
  too_large: msg("La foto es demasiado grande."),
  not_found: msg("No hemos encontrado este producto. Puedes escribirlo o añadirlo a mano."),
  lookup_unavailable: msg("La base de datos de productos no responde. Prueba más tarde."),
  server_error: msg("Error inesperado del servidor."),
};

/** Texto para el usuario a partir de cualquier error de una petición. */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return t(MESSAGES[error.code], { url: error.url ?? "?", status: error.status ?? "?" });
  }
  return error instanceof Error ? error.message : String(error);
}

/** ¿Tiene sentido ofrecer «Reintentar»? */
export function isRetryable(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    ["network", "timeout", "ai_busy", "ai_unavailable", "ai_timeout", "ai_invalid_response", "rate_limited", "lookup_unavailable", "http", "server_error"].includes(error.code)
  );
}
