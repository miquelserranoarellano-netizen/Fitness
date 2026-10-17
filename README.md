# Fitness · Appcombinada

App de móvil (Expo / React Native) que une **Smart Fitness Coach** (Miquel), un entrenador de hipertrofia
con rutina por reglas, modo entrenamiento, seguimiento de peso y medidas y revisiones, con **SnapCal**
(Marc), que registra la comida con fotos y calcula calorías y macros.

> En desarrollo: la fusión va por fases. El plan y las decisiones están en [`fusion/PLAN-FUSION.md`](fusion/PLAN-FUSION.md)
> y el estado de cada fase en [`app/docs/ESTADO.md`](app/docs/ESTADO.md).

## Estructura

| Carpeta | Contenido |
| --- | --- |
| [`app/`](app/) | La app (Expo SDK 57, Expo Router, SQLite en el teléfono). Normas en `app/CLAUDE.md` |
| `server/` | Servidor para analizar fotos y textos de comida (llega en la fase 4) |
| [`fusion/`](fusion/) | El encargo, los resúmenes de las dos apps de partida y el plan de fusión |

## Arrancar la app

Hace falta Node 22 o superior.

```bash
cd app
npm ci
npm start        # escanear el QR con Expo Go (SDK 57)
npm run check    # tipos, lint y pruebas
```

Más detalles (WSL, móvil en la misma wifi) en [`app/README.md`](app/README.md).
