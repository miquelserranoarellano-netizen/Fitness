# Servidor de Appcombinada

Analiza fotos y textos de comida con Claude y busca las cifras reales en USDA FoodData Central y Open Food
Facts. Viene de SnapCal (Marc), modernizado en la fase 4 de la fusión. La clave de Anthropic vive **solo aquí**:
la app nunca la ve.

## Arrancar

Hace falta Node 22 o superior.

```bash
cd server
npm ci
cp .env.example .env   # y rellena lo que tengas (ver abajo)
npm start              # o `npm run dev` para recargar al guardar
npm test               # pruebas sin red ni claves
```

| Variable | Para qué | Si falta |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Análisis de fotos y textos | Esas rutas responden `503 ai_not_configured`; el código de barras funciona igual |
| `ANTHROPIC_MODEL` | Modelo de Claude | `claude-sonnet-5-5` |
| `ANTHROPIC_EFFORT` | `low` … `max`: menos esfuerzo responde antes | El del modelo |
| `ACCESS_CODES` | Códigos de acceso, uno por persona: `nombre:código,nombre2:código2` (`npm run new-code -- nombre`). Cada persona escribe el suyo en la app (Más → Servidor) | Sin comprobación (solo en desarrollo). Con `NODE_ENV=production` el servidor no arranca |
| `DAILY_LIMIT_PER_PERSON` / `DAILY_LIMIT_TOTAL` | Análisis con IA al día por persona y en total (0 = sin límite) | `40` / `300` |
| `MAX_CONCURRENT_ANALYSES` | Análisis con IA a la vez | `4` |
| `RATE_LIMIT_PER_MINUTE` | Peticiones por minuto y dirección IP | `20` |
| `TRUST_PROXY` | Saltos de proxy delante (Caddy en el VPS: `1`) | Ninguno |
| `ALLOWED_ORIGINS` | Webs de otro dominio que pueden llamar (separadas por comas) | Desarrollo: cualquiera. Producción: ninguna |
| `USDA_API_KEY` | Búsquedas en USDA ([clave gratuita](https://fdc.nal.usda.gov/api-key-signup)) | `DEMO_KEY`, con un límite muy bajo |
| `PORT` / `HOST` | Puerto y dirección | `3000`, todas |

Para el VPS (Docker, HTTPS, códigos), ver [`../DESPLIEGUE.md`](../DESPLIEGUE.md). La revisión de seguridad está en
[`../SEGURIDAD.md`](../SEGURIDAD.md).

## Rutas

| Ruta | Cuerpo | Respuesta |
| --- | --- | --- |
| `GET /health` | | `{ ok, ai, auth }` (`ai`: si hay clave de Anthropic; `auth`: si pide código) |
| `GET /me` | | `{ name, used, limit, ai }`: de quién es el código y cuántos análisis lleva hoy |
| `POST /analyze` | `{ imageBase64, mediaType, language, avoid }` | Resultado del análisis |
| `POST /analyze-text` | `{ text, language, avoid }` (texto de hasta 500 caracteres) | Resultado del análisis |
| `GET /barcode/:code?language=` | | Resultado con un alimento, más `per_100g` y `serving_grams` |

- Todas salvo `/health` piden `Authorization: Bearer <código>` si hay `ACCESS_CODES`.
- `language`: `es`, `en`, `fr` o `de` (idioma de los nombres de los alimentos). Otro valor: `es`.
- `avoid`: lista de alergias o alimentos que el usuario evita (hasta 20). Cada alimento trae en `may_contain`
  los de esa lista que podría contener. Es un aviso para comprobar, no un diagnóstico.
- Resultado: `{ is_food, dish_name, items[], total_calories_min, total_calories_max, notes }`. Cada alimento:
  `name, grams, calories, protein_g, carbs_g, fat_g, fiber_g?, sugar_g?, sodium_mg?, confidence, source
  (usda | off | ai), matched_name, may_contain`.
- Errores: `{ code, error }`. La app traduce el `code` (`app/src/lib/api.ts`).

| Código | Estado | Cuándo |
| --- | --- | --- |
| `bad_request` | 400 | Falta la imagen o el texto, la imagen no es JPEG, PNG ni WebP, código de barras no válido |
| `unauthorized` | 401 | Hay `ACCESS_CODES` y el código falta, no existe o se ha retirado |
| `not_found` | 404 | Código de barras que no está en Open Food Facts |
| `too_large` | 413 | Foto de más de 8 MB o texto de más de 32 KB |
| `ai_refused` | 422 | El modelo (y su alternativa) se ha negado a analizarlo |
| `rate_limited` / `ai_busy` / `quota_exceeded` | 429 | Más de 20 peticiones por minuto / Anthropic saturada o demasiados análisis a la vez / cupo diario agotado |
| `ai_invalid_response`, `ai_bad_request`, `lookup_unavailable` | 502 | Respuesta cortada o mal formada / petición rechazada / Open Food Facts no responde |
| `ai_not_configured`, `ai_auth_failed`, `ai_unavailable` | 503 | Sin clave / clave no válida / la API no responde |
| `ai_timeout` | 504 | Claude no ha respondido a tiempo (50 s, con un reintento) |

## Cómo funciona el análisis

1. Claude identifica los alimentos y estima los gramos. Pide **salida estructurada** (`output_config.format`
   con un esquema JSON), así que no hay que buscar el JSON dentro del texto, y se valida con Zod.
2. Si el modelo declina por su política de uso, la API **reintenta en un modelo alternativo** (`fallbacks:
   "default"`, beta `server-side-fallback-2026-07-01`). Para quitarlo, borra esas dos líneas de
   `src/analysis.js`.
3. Para cada alimento se busca una coincidencia en USDA (o primero en Open Food Facts si es envasado). Si hay una
   coherente con la estimación, sus cifras por 100 g sustituyen a las de la IA (`source: usda | off`).
4. El margen de calorías depende de la seguridad del modelo y de cuántas cifras salen de la base de datos (nunca
   menos del 8 %).

Las búsquedas se guardan en memoria (2000 entradas). Los fallos de red no se guardan.

## Desde el móvil

El móvil tiene que llegar al ordenador en el puerto 3000. Con WSL hace falta la red «mirrored» (`.wslconfig`) y
permitir el puerto 3000 en el cortafuegos de Windows, igual que el 8081 de Expo. La app usa, si no se configura
otra cosa, el mismo ordenador que le sirve el código (ver `resolveApiUrl` en `app/src/lib/api.ts`).

## Archivos

- `index.js`: arranque y configuración.
- `src/app.js`: rutas, validación, límite de peticiones, cupos y errores.
- `src/access.js`: códigos de acceso y cupo diario.
- `scripts/new-code.js`: genera un código de acceso.
- `Dockerfile`: imagen para el VPS (sin root).
- `src/analysis.js`: instrucciones, esquema, llamada a Claude y resultado.
- `src/nutrition.js`: búsquedas en USDA y Open Food Facts.
- `test/`: pruebas con `node --test` (cliente de Anthropic y bases de datos falsos).
