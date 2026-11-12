# Appcombinada

Fusión de Smart Fitness Coach (Miquel) y SnapCal (Marc) en una sola app de móvil.

- `app/`: la app combinada (Expo). Sus normas están en `app/CLAUDE.md`.
- `server/`: el servidor de SnapCal modernizado (Express, Claude con salida estructurada, USDA y Open Food Facts).
  La clave de Anthropic solo vive en `server/.env`, nunca en la app. Pruebas: `npm test` dentro de `server/`.
- Despliegue: `docker-compose.yml` (raíz), `deploy/` (Caddy, imagen de la web, scripts del VPS y `subir.ps1` para
  subirla desde el PC) y `DESPLIEGUE.md` (VPS de Hostinger). Una sola dirección: en `/` la presentación de IKYNDO
  en HTML (`deploy/landing/`, sin JavaScript) y en `/app` la app (`experiments.baseUrl` de `app/app.json`).
  Acceso al servidor con códigos por persona (`ACCESS_CODES`), nunca con secretos dentro de la app. `SEGURIDAD.md`
  recoge la revisión de seguridad: ponla al día si cambias algo de lo que cuenta.
- `originales/`: copias intactas de las dos apps. Solo de consulta: no se modifican.
- `fusion/`: el encargo (`PROMPT-FUSION-APPS.md`), los dos resúmenes y el plan con las decisiones (`PLAN-FUSION.md`).

Trabajo por fases (ver el plan): cada una termina con `npm run check` en verde dentro de `app/` (y `npm test` en
`server/` si se ha tocado), con un commit subido a GitHub (`main`, repositorio privado Fitness) y con un resumen de
qué falta y qué probar en el móvil. Textos y comentarios en español de España, tuteando.
