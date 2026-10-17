import { createHash, timingSafeEqual } from "node:crypto";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { z } from "zod";
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

const sha256 = (value) => createHash("sha256").update(value).digest();

/** Compara el token sin filtrar por el tiempo cuánto coincide. */
function tokenMatches(received, expected) {
  return typeof received === "string" && timingSafeEqual(sha256(received), sha256(expected));
}

const fail = (res, status, code, error) => res.status(status).json({ code, error });

export function createApp({
  client = null,
  model = "claude-sonnet-5-5",
  effort = null,
  appToken = "",
  lookupFood,
  lookupBarcode,
  rateLimitPerMinute = 20,
  logger = console,
} = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors());

  app.get("/health", (_req, res) => res.json({ ok: true, ai: client !== null }));

  // Lo que cuesta dinero o consulta fuera va con límite de peticiones y, si se configura, con token.
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    limit: rateLimitPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => fail(res, 429, "rate_limited", "Demasiadas peticiones. Espera un minuto."),
  });
  const checkToken = (req, res, next) => {
    if (appToken && !tokenMatches(req.get("x-app-token"), appToken)) {
      return fail(res, 401, "unauthorized", "Token de la app incorrecto.");
    }
    next();
  };
  app.use(["/analyze", "/analyze-text", "/barcode"], limiter, checkToken);
  // Después del token: una petición sin permiso no llega a leer los 8 MB del cuerpo.
  app.use(express.json({ limit: "8mb" }));

  const analyze = (source) => async (req, res, next) => {
    try {
      const parsed = (source === "image" ? imageBody : textBody).safeParse(req.body ?? {});
      if (!parsed.success) {
        return fail(res, 400, "bad_request", parsed.error.issues[0]?.message ?? "Petición no válida.");
      }
      const body = parsed.data;
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
        mediaType: body.mediaType,
        text: body.text,
      });
      res.json(await buildResult(analysis, language, avoid, lookupFood));
    } catch (error) {
      next(error);
    }
  };

  app.post("/analyze", analyze("image"));
  app.post("/analyze-text", analyze("text"));

  // Producto envasado por código de barras (Open Food Facts).
  app.get("/barcode/:code", async (req, res, next) => {
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
    if (error?.type === "entity.too.large") return fail(res, 413, "too_large", "La imagen es demasiado grande.");
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
