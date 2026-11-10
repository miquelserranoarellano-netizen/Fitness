import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { parseAccessCodes } from "./src/access.js";
import { createApp } from "./src/app.js";
import { lookupBarcode, lookupFood } from "./src/nutrition.js";

// Arranque: lee la configuración de `.env` (ver `.env.example`). Sin clave de Anthropic el servidor
// funciona igual para los códigos de barras; el análisis de fotos y textos responde `ai_not_configured`.
// En producción (`NODE_ENV=production`) no arranca sin códigos de acceso: mejor parado que abierto.

const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const production = process.env.NODE_ENV === "production";

function stop(message) {
  console.error(message);
  process.exit(1);
}

/** Entero >= 0 de una variable, o el valor por defecto. */
function count(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) stop(`${name}="${raw}" no es un número entero positivo.`);
  return value;
}

/** `TRUST_PROXY`: vacío o false = ninguno; un número = saltos de proxy; si no, la lista de direcciones. */
function trustProxySetting(raw = "") {
  const value = raw.trim();
  if (!value || value === "false") return false;
  if (value === "true") return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
const model = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5-5";
let effort = process.env.ANTHROPIC_EFFORT?.trim() || null;
if (effort && !EFFORTS.includes(effort)) {
  console.warn(`ANTHROPIC_EFFORT="${effort}" no es válido (${EFFORTS.join(", ")}): se usa el del modelo.`);
  effort = null;
}

const { testers, problems } = parseAccessCodes(process.env.ACCESS_CODES);
if (problems.length > 0) stop(`ACCESS_CODES no es válido:\n- ${problems.join("\n- ")}`);
if (production && testers.length === 0) {
  stop("En producción hace falta ACCESS_CODES (nombre:código, separados por comas). Genera uno con: npm run new-code -- nombre");
}
if (process.env.APP_TOKEN?.trim()) console.warn("APP_TOKEN ya no se usa (iba dentro de la app y no protegía nada): usa ACCESS_CODES.");

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const client = apiKey ? new Anthropic({ apiKey }) : null;
const app = createApp({
  client,
  model,
  effort,
  testers,
  lookupFood,
  lookupBarcode,
  rateLimitPerMinute: count("RATE_LIMIT_PER_MINUTE", 20),
  dailyLimitPerPerson: count("DAILY_LIMIT_PER_PERSON", 40),
  dailyLimitTotal: count("DAILY_LIMIT_TOTAL", 300),
  maxConcurrentAnalyses: Math.max(1, count("MAX_CONCURRENT_ANALYSES", 4)),
  // En desarrollo la web de Expo (otro puerto) llama directamente; en producción va por el mismo dominio.
  corsOrigins: allowedOrigins.length > 0 ? allowedOrigins : production ? [] : "*",
  trustProxy: trustProxySetting(process.env.TRUST_PROXY),
});

const port = count("PORT", 3000) || 3000;
const host = process.env.HOST?.trim() || undefined;
const server = app.listen(port, host, () => {
  console.log(`Servidor de Appcombinada escuchando en ${host ?? ""}:${port}${production ? " (producción)" : ""}`);
  console.log(client ? `IA: ${model}${effort ? ` (esfuerzo ${effort})` : ""}` : "IA sin configurar: falta ANTHROPIC_API_KEY en .env");
  console.log(testers.length > 0 ? `Códigos de acceso: ${testers.map((tester) => tester.name).join(", ")}` : "Sin códigos de acceso: cualquiera que llegue al servidor puede usarlo (solo para desarrollo).");
});

// Docker detiene el contenedor con SIGTERM: se terminan las peticiones en curso antes de salir.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
