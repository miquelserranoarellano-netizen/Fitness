# Fitness · Appcombinada

App de móvil (Expo / React Native) que une **Smart Fitness Coach** (Miquel), un entrenador de hipertrofia
con rutina por reglas, modo entrenamiento, seguimiento de peso y medidas y revisiones, con **SnapCal**
(Marc), que registra la comida con fotos y calcula calorías y macros.

> Para colaborar (Marc y su Claude): [`COLABORAR.md`](COLABORAR.md).
>
> En desarrollo: la fusión va por fases. El plan y las decisiones están en [`fusion/PLAN-FUSION.md`](fusion/PLAN-FUSION.md)
> y el estado de cada fase en [`app/docs/ESTADO.md`](app/docs/ESTADO.md).

## Estructura

| Carpeta | Contenido |
| --- | --- |
| [`app/`](app/) | La app (Expo SDK 58, Expo Router, SQLite en el navegador o en el teléfono). Normas en `app/CLAUDE.md` |
| [`server/`](server/) | Servidor que analiza fotos y textos de comida con Claude y busca las cifras en USDA y Open Food Facts |
| [`deploy/`](deploy/) | Caddy, imagen de la web y scripts del VPS (`subir.ps1` para subirla desde el PC) |
| [`fusion/`](fusion/) | El encargo, los resúmenes de las dos apps de partida y el plan de fusión |

## Arrancar la app

Hace falta Node 22 o superior.

```bash
cd app
npm ci
npm run web      # la app en el navegador
npm run check    # tipos, lint y pruebas
```

Más detalles en [`app/README.md`](app/README.md).

## Arrancar el servidor

Solo hace falta para registrar comida con foto, texto o código de barras.

```bash
cd server
npm ci
cp .env.example .env   # pon tu ANTHROPIC_API_KEY (sin ella solo funciona el código de barras)
npm start              # escucha en el puerto 3000
npm test
```

La app lo busca en el mismo ordenador, puerto 3000; para cambiarlo, `app/.env.example`. Detalles en
[`server/README.md`](server/README.md).

## En internet (VPS)

La web de IKYNDO (presentación en HTML en `tudominio.com` y app en `tudominio.com/app`) y el servidor van en un VPS con Docker y HTTPS
automático (Caddy): `docker compose up -d --build` en la raíz, con el `.env` de [`.env.example`](.env.example), o
desde el PC con `deploy\subir.ps1`. Paso a paso para Hostinger, incluido el camino al App Store, en
[`DESPLIEGUE.md`](DESPLIEGUE.md). Revisión de seguridad en [`SEGURIDAD.md`](SEGURIDAD.md).
