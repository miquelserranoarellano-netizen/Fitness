import Constants from "expo-constants";
import { Platform } from "react-native";
import { getAccessCode } from "./access-code";
import { createApiClient, resolveApiUrl, type ApiClient } from "./api";

/**
 * Configuración del cliente del servidor:
 *
 * - `EXPO_PUBLIC_API_URL` (`app/.env`, ver `app/.env.example`): dirección del servidor. En la web publicada
 *   en el VPS es `/api` (mismo dominio). Si falta, en desarrollo se usa el ordenador que sirve la app en el
 *   puerto 3000 (ver `resolveApiUrl`).
 * - El código de acceso de cada persona se escribe en la app (Más → Servidor) y se guarda en el teléfono o
 *   el navegador (`access-code.ts`). La clave de Anthropic nunca va en la app.
 */

const isWeb = Platform.OS === "web" && typeof window !== "undefined";

function devHost(): string | null {
  if (Platform.OS === "web") return isWeb ? window.location.hostname : null;
  return Constants.expoConfig?.hostUri ?? null;
}

let client: ApiClient | null = null;

export function getApi(): ApiClient {
  client ??= createApiClient({
    baseUrl: resolveApiUrl({ configured: process.env.EXPO_PUBLIC_API_URL, devHost: devHost(), webOrigin: isWeb ? window.location.origin : null }),
    accessCode: getAccessCode,
  });
  return client;
}
