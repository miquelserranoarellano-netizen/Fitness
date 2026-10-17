import Constants from "expo-constants";
import { Platform } from "react-native";
import { createApiClient, resolveApiUrl, type ApiClient } from "./api";

/**
 * Configuración del cliente del servidor (`app/.env`, ver `app/.env.example`):
 *
 * - `EXPO_PUBLIC_API_URL`: dirección del servidor. Si falta, en desarrollo se usa el ordenador que
 *   sirve la app en el puerto 3000 (ver `resolveApiUrl`).
 * - `EXPO_PUBLIC_APP_TOKEN`: el mismo valor que `APP_TOKEN` en `server/.env`, si se ha puesto.
 *
 * Las variables `EXPO_PUBLIC_*` acaban dentro de la app: el token frena a curiosos, pero no es un
 * secreto. La clave de Anthropic nunca va aquí.
 */

function devHost(): string | null {
  if (Platform.OS === "web") return typeof window === "undefined" ? null : window.location.hostname;
  return Constants.expoConfig?.hostUri ?? null;
}

let client: ApiClient | null = null;

export function getApi(): ApiClient {
  client ??= createApiClient({
    baseUrl: resolveApiUrl({ configured: process.env.EXPO_PUBLIC_API_URL, devHost: devHost() }),
    appToken: process.env.EXPO_PUBLIC_APP_TOKEN,
  });
  return client;
}
