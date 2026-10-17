import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { createApp } from "./src/app.js";
import { lookupBarcode, lookupFood } from "./src/nutrition.js";

// Arranque: lee la configuración de `.env` (ver `.env.example`). Sin clave de Anthropic el servidor
// funciona igual para los códigos de barras; el análisis de fotos y textos responde `ai_not_configured`.

const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
const model = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5-5";
const appToken = process.env.APP_TOKEN?.trim() || "";
let effort = process.env.ANTHROPIC_EFFORT?.trim() || null;
if (effort && !EFFORTS.includes(effort)) {
  console.warn(`ANTHROPIC_EFFORT="${effort}" no es válido (${EFFORTS.join(", ")}): se usa el del modelo.`);
  effort = null;
}

const client = apiKey ? new Anthropic({ apiKey }) : null;
const app = createApp({ client, model, effort, appToken, lookupFood, lookupBarcode });

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Servidor de Appcombinada escuchando en :${port}`);
  console.log(client ? `IA: ${model}${effort ? ` (esfuerzo ${effort})` : ""}` : "IA sin configurar: falta ANTHROPIC_API_KEY en .env");
  if (client && !appToken) console.warn("Sin APP_TOKEN: cualquiera que llegue al servidor puede gastar tu saldo de Anthropic.");
});
