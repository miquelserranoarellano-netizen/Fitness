import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { bearerToken, createDailyQuota, createFailureTracker, findTester } from "./access.js";
import {
  AnalysisError,
  LANGS,
  applyExtras,
  buildResult,
  cleanAvoidList,
  pickLanguage,
  requestAnalysis,
} from "./analysis.js";
import { LookupUnavailableError } from "./nutrition.js";

/**
 * Rutas del servidor. Todo lo externo (cliente de Anthropic, búsquedas en bases de datos) llega por
 * parámetro, así las pruebas lo sustituyen sin red ni claves.
 *
 * Errores: `{ code, error }` con un código estable (la app lo traduce) y un mensaje para los registros.
 */

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
/** ~5 MB de imagen en base64. La app manda fotos reducidas (unos cientos de KB). */
export const MAX_IMAGE_CHARS = 7_000_000;
export const MAX_TEXT_CHARS = 500;

const imageBody = z.object({
  imageBase64: z
    .string()
    .transform((value) => value.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, ""))
    .refine((value) => value.length >= 100 && value.length <= MAX_IMAGE_CHARS, "Tamaño de imagen no válido")
    .refine((value) => /^[A-Za-z0-9+/]+={0,2}$/.test(value), "La imagen no está en base64"),
  mediaType: z.enum(IMAGE_TYPES).default("image/jpeg"),
  language: z.unknown().optional(),
  avoid: z.unknown().optional(),
});

const textBody = z.object({
  text: z
    .string()
    .transform((value) => value.trim().slice(0, MAX_TEXT_CHARS))
    .refine((value) => value.length >= 2, "Falta el texto"),
  language: z.unknown().optional(),
  avoid: z.unknown().optional(),
});

/**
 * Formato real de la imagen según sus primeros bytes (no según lo que diga la petición), o null si no es
 * JPEG, PNG ni WebP. Así a la IA solo llegan imágenes de verdad.
 */
export function sniffImageType(base64) {
  const head = Buffer.from(base64.slice(0, 24), "base64");
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (head.toString("latin1", 0, 4) === "RIFF" && head.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

const fail = (res, status, code, error) => res.status(status).json({ code, error });

export function createApp({
  client = null,
  model = "claude-sonnet-5-5",
  effort = null,
  /** Personas con código de acceso (`parseAccessCodes`). Vacío: sin comprobación (solo para desarrollo). */
  testers = [],
  lookupFood,
  lookupBarcode,
  rateLimitPerMinute = 20,
  /** Análisis con IA al día por persona y en total (0 = sin límite). */
  dailyLimitPerPerson = 40,
  dailyLimitTotal = 300,
  /** Análisis con IA a la vez, en total y por persona; el resto recibe `ai_busy`. */
  maxConcurrentAnalyses = 4,
  maxConcurrentPerPerson = 2,
  /** Códigos incorrectos desde una misma dirección antes de bloquearla 10 minutos (0 = sin bloqueo). */
  maxAuthFailures = 10,
  /** Orígenes web que pueden llamar desde otro dominio: "*" (desarrollo), una lista o ninguno. */
  corsOrigins = "*",
  /** Proxies delante (Caddy): sin esto, todos los usuarios compartirían el límite de peticiones. */
  trustProxy = false,
  logger = console,
  now = () => new Date(),
} = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", trustProxy);
  if (corsOrigins === "*") app.use(cors());
  else if (Array.isArray(corsOrigins) && corsOrigins.length > 0) app.use(cors({ origin: corsOrigins, maxAge: 600 }));

  // Las respuestas son de una persona concreta: que no se guarden en cachés intermedias.
  app.use((_req, res, next) => {
    res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
    next();
  });

  app.get("/health", (_req, res) => res.json({ ok: true, ai: client !== null, auth: testers.length > 0 }));

  // Todo lo que cuesta dinero o consulta fuera va con límite de peticiones y código de acceso.
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    limit: rateLimitPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => fail(res, 429, "rate_limited", "Demasiadas peticiones. Espera un minuto."),
  });
  // Quien prueba códigos al azar se queda sin intentos: una dirección bloqueada ni siquiera se comprueba.
  const failures = createFailureTracker({ limit: maxAuthFailures, now: () => now().getTime() });
  const authenticate = (req, res, next) => {
    if (testers.length === 0) {
      req.tester = "local";
      return next();
    }
    const address = req.ip ?? "?";
    if (failures.blocked(address)) {
      res.set("Retry-After", "600");
      return fail(res, 429, "auth_blocked", "Demasiados códigos incorrectos desde tu conexión. Espera 10 minutos.");
    }
    const name = findTester(testers, bearerToken(req.get("authorization")));
    if (!name) {
      failures.fail(address);
      logger.warn(`[acceso] código incorrecto o ausente en ${req.path} desde ${address}`);
      return fail(res, 401, "unauthorized", "Código de acceso incorrecto o retirado.");
    }
    req.tester = name;
    next();
  };
  const guard = [limiter, authenticate];
  // El cuerpo se lee después del código: una petición sin permiso no llega a leer nada. Y cada ruta
  // acepta solo lo que necesita (el texto no necesita 8 MB).
  const imageJson = express.json({ limit: "8mb" });
  const textJson = express.json({ limit: "32kb" });

  const quota = createDailyQuota({ perPerson: dailyLimitPerPerson, total: dailyLimitTotal, now });
  let running = 0;
  const runningBy = new Map(); // persona -> análisis en marcha
  /** Fallos en los que Anthropic no ha llegado a trabajar (ni a cobrar): se devuelve el análisis al cupo. */
  const UNBILLED = new Set(["ai_busy", "ai_unavailable", "ai_auth_failed", "ai_bad_request"]);

  // Registro de uso: quién, qué ruta, cómo acabó y cuánto tardó. Nunca el contenido.
  const logUsage = (req, res, next) => {
    const started = Date.now();
    res.on("finish", () => logger.log(`[uso] ${req.tester ?? "-"} ${req.path} ${res.statusCode} ${Date.now() - started} ms`));
    next();
  };

  app.get("/me", guard, (req, res) => {
    const { used, limit } = quota.status(req.tester);
    res.json({ name: req.tester, used, limit, ai: client !== null });
  });

  const analyze = (source) => async (req, res, next) => {
    let started = false;
    // Si quien pide el análisis se va (cancela o pierde la conexión), se corta también la petición a la IA.
    const gone = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) gone.abort();
    });
    try {
      const parsed = (source === "image" ? imageBody : textBody).safeParse(req.body ?? {});
      if (!parsed.success) {
        return fail(res, 400, "bad_request", parsed.error.issues[0]?.message ?? "Petición no válida.");
      }
      const body = parsed.data;
      let mediaType = body.mediaType;
      if (source === "image") {
        mediaType = sniffImageType(body.imageBase64);
        if (!mediaType) return fail(res, 400, "bad_request", "La imagen no es JPEG, PNG ni WebP.");
      }
      if (!client) throw new AnalysisError("ai_not_configured", 503, "El servidor no tiene configurada la clave de Anthropic.");
      if ((runningBy.get(req.tester) ?? 0) >= maxConcurrentPerPerson) {
        return fail(res, 429, "ai_busy", "Ya tienes análisis en marcha. Espera a que terminen.");
      }
      if (running >= maxConcurrentAnalyses) return fail(res, 429, "ai_busy", "Hay demasiados análisis a la vez. Prueba en un momento.");
      const over = quota.take(req.tester);
      if (over) {
        logger.warn(`[cupo] ${req.tester}: ${over === "person" ? "su límite diario" : "el límite diario total"}`);
        return fail(res, 429, "quota_exceeded", over === "person" ? "Has llegado a tu límite de análisis de hoy." : "El servidor ha llegado al límite de análisis de hoy.");
      }

      running += 1;
      runningBy.set(req.tester, (runningBy.get(req.tester) ?? 0) + 1);
      started = true;
      const language = pickLanguage(body.language);
      const avoid = cleanAvoidList(body.avoid);
      const analysis = await requestAnalysis({
        client,
        model,
        effort,
        source,
        language,
        avoid,
        imageBase64: body.imageBase64,
        mediaType,
        text: body.text,
        signal: gone.signal,
      });
      res.json(await buildResult(analysis, language, avoid, lookupFood));
    } catch (error) {
      if (started && error instanceof AnalysisError && UNBILLED.has(error.code)) quota.refund(req.tester);
      // Ya no hay nadie esperando la respuesta: no hay nada que contestar.
      if (gone.signal.aborted) return;
      next(error);
    } finally {
      if (started) {
        running -= 1;
        const mine = (runningBy.get(req.tester) ?? 1) - 1;
        if (mine > 0) runningBy.set(req.tester, mine);
        else runningBy.delete(req.tester);
      }
    }
  };

  app.post("/analyze", guard, logUsage, imageJson, analyze("image"));
  app.post("/analyze-text", guard, logUsage, textJson, analyze("text"));

  // Producto envasado por código de barras (Open Food Facts).
  app.get("/barcode/:code", guard, async (req, res, next) => {
    try {
      const code = String(req.params.code ?? "");
      if (!/^\d{8,14}$/.test(code)) return fail(res, 400, "bad_request", "Código de barras no válido.");
      const language = pickLanguage(req.query.language);

      const found = await lookupBarcode(code);
      if (!found) return fail(res, 404, "not_found", "Producto no encontrado.");

      const grams = Math.round(found.servingGrams ?? 100);
      const factor = grams / 100;
      const per100 = found.per100;
      const name = found.name || LANGS[language].food;
      // La marca solo si añade algo («Nutella», no «Nutella · Nutella»).
      const brand = found.brand && !name.toLowerCase().includes(found.brand.toLowerCase()) ? found.brand : null;
      const fullName = [name, brand].filter(Boolean).join(" · ").slice(0, 80);
      const item = {
        name: name.slice(0, 80),
        grams,
        calories: Math.round(per100.kcal100 * factor),
        protein_g: Math.round(per100.protein100 * factor),
        carbs_g: Math.round(per100.carbs100 * factor),
        fat_g: Math.round(per100.fat100 * factor),
        confidence: 1,
        source: "off",
        matched_name: fullName,
        may_contain: [],
      };
      applyExtras(item, per100, factor);
      res.json({
        is_food: true,
        dish_name: fullName,
        items: [item],
        // Datos de la etiqueta: margen pequeño.
        total_calories_min: Math.round(item.calories * 0.95),
        total_calories_max: Math.round(item.calories * 1.05),
        notes: "",
        // Lo que trae Open Food Facts por 100 g, para que la app recalcule si cambias la cantidad.
        per_100g: {
          calories: per100.kcal100,
          protein_g: per100.protein100,
          carbs_g: per100.carbs100,
          fat_g: per100.fat100,
          fiber_g: per100.fiber100 ?? null,
          sugar_g: per100.sugar100 ?? null,
          sodium_mg: per100.sodium100 ?? null,
        },
        serving_grams: found.servingGrams ?? null,
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((_req, res) => fail(res, 404, "not_found", "Ruta no encontrada."));

  // Errores: los del análisis ya traen código; el resto se clasifica aquí. Nunca se registra la imagen.
  app.use((error, req, res, _next) => {
    if (error?.type === "entity.too.large") return fail(res, 413, "too_large", "La petición es demasiado grande.");
    if (error?.type === "entity.parse.failed") return fail(res, 400, "bad_request", "El cuerpo no es un JSON válido.");
    if (error instanceof LookupUnavailableError) {
      logger.warn(`[${req.path}] ${error.message}`);
      return fail(res, 502, "lookup_unavailable", "La base de datos de productos no responde.");
    }
    const known = error instanceof AnalysisError ? error : new AnalysisError("server_error", 500, "Error inesperado.", error);
    const cause = known.cause?.message ? ` (${known.cause.message})` : "";
    logger.error(`[${req.path}] ${known.code}: ${known.message}${cause}`);
    fail(res, known.status, known.code, known.message);
  });

  return app;
}
