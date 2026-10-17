# Appcombinada

Fusión de Smart Fitness Coach (Miquel) y SnapCal (Marc) en una sola app de móvil.

- `app/`: la app combinada (Expo). Sus normas están en `app/CLAUDE.md`.
- `server/`: el servidor de SnapCal modernizado (Express, Claude con salida estructurada, USDA y Open Food Facts).
  La clave de Anthropic solo vive en `server/.env`, nunca en la app. Pruebas: `npm test` dentro de `server/`.
- `originales/`: copias intactas de las dos apps. Solo de consulta: no se modifican.
- `fusion/`: el encargo (`PROMPT-FUSION-APPS.md`), los dos resúmenes y el plan con las decisiones (`PLAN-FUSION.md`).

Trabajo por fases (ver el plan): cada una termina con `npm run check` en verde dentro de `app/` (y `npm test` en
`server/` si se ha tocado), con un commit subido a GitHub (`main`, repositorio privado Fitness) y con un resumen de
qué falta y qué probar en el móvil. Textos y comentarios en español de España, tuteando.
