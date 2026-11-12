/**
 * Funciones que se encienden al compilar la app.
 *
 * La IA (reconocer una comida por su foto o su texto con Claude) va **apagada**: cada análisis gasta tokens de la
 * clave de Anthropic del servidor, y en la prueba no se quiere ese gasto. Apagada, no aparece nada de IA: las
 * comidas se añaden por código de barras, desde favoritas o a mano. Para encenderla hacen falta las dos cosas:
 * `EXPO_PUBLIC_AI=on` al compilar (en la web, el `ARG` de `deploy/web.Dockerfile`) y `ANTHROPIC_API_KEY` en el
 * `.env` del servidor. Sin clave, el servidor no puede llamar a Anthropic aunque la app lo intentara.
 */
export const AI_ENABLED = process.env.EXPO_PUBLIC_AI === "on";
