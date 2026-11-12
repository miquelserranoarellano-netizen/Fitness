# IKYNDO · Cómo trabajar en el proyecto (para Marc y su Claude)

Hola, Marc: este documento es para que tú (y tu Claude) podáis editar la app igual que Miquel. **Si eres el Claude de
Marc:** léelo entero y después `CLAUDE.md`, `app/CLAUDE.md`, `app/AGENTS.md` y `app/docs/ESTADO.md` antes de tocar
nada. Ahí están las normas del proyecto y el estado al día.

## Qué es

**IKYNDO** es la fusión de las dos apps: el entrenador de hipertrofia de Miquel (Smart Fitness Coach: rutina por
reglas, modo entrenamiento, peso, medidas y revisiones) y tu SnapCal (registro de comidas, calorías y macros). Un solo
código para las dos salidas:

| Salida | Dónde | Quién |
| --- | --- | --- |
| Web de prueba | **https://ikyndo.tech** (presentación) y **https://ikyndo.tech/app/** (la app, instalable en iPhone y Android desde el navegador) | VPS de Hostinger de Miquel |
| App del App Store | Compilada con EAS desde este mismo código | Tú |
| Servidor | **https://ikyndo.tech/api** (lo usan la web y la app nativa) | El mismo VPS |

## Acceso

1. **Repositorio:** `github.com/miquelserranoarellano-netizen/Fitness` (privado, rama `main`). Miquel te añade como
   colaborador (GitHub → Settings → Collaborators); acepta la invitación que te llega por correo. Tu fork
   `mdjoyanes/fitneesduo` comparte historia con este repo: a partir de ahora lo más sencillo es trabajar aquí
   directamente y dejar el fork solo para lo que ya tengas publicado.
2. **Código de acceso al servidor:** Miquel te pasa el tuyo por privado (para buscar productos por código de barras
   desde la app). No lo subas nunca al repositorio.
3. **VPS (solo si vas a publicar tú):** crea una clave SSH y pásale a Miquel **solo la parte pública** (`.pub`) para
   que la añada al servidor. Nunca compartáis claves privadas ni contraseñas por chat.

## Arrancar en tu ordenador

Hace falta Node 22 o superior.

```bash
git clone https://github.com/miquelserranoarellano-netizen/Fitness.git
cd Fitness/app
npm ci
npm run web       # la app en el navegador (abre la dirección que salga)
npm run check     # tipos, lint y pruebas: tiene que salir en verde antes de subir nada
npm run i18n      # textos sin traducir: tiene que decir «Todo traducido»
```

Para el móvil nativo: `npx expo start` (o tu build de desarrollo de EAS). El servidor en local es opcional (solo
para el código de barras):

```bash
cd Fitness/server
npm ci
cp .env.example .env   # sin clave de Anthropic: la IA va apagada
npm start              # puerto 3000
npm test
```

## Estructura

| Carpeta / archivo | Qué hay |
| --- | --- |
| `app/` | La app (Expo SDK 58, Expo Router, SQLite). Pantallas en `app/src/app/`, lógica pura con pruebas en `app/src/domain/`, datos en `app/src/data/` |
| `app/src/i18n/catalogs/` | Traducciones EN, FR y DE (la clave es el texto en español) |
| `server/` | Servidor Express: códigos de barras (Open Food Facts), USDA y, si se enciende, el análisis con IA |
| `deploy/` | Caddy, imagen Docker de la web, presentación en HTML (`deploy/landing/`) y scripts del VPS |
| `DESPLIEGUE.md` | Cómo se publica en Hostinger y el camino al App Store |
| `SEGURIDAD.md` | Revisiones de seguridad (ponla al día si cambias algo de lo que cuenta) |
| `app/docs/ESTADO.md` | Qué se ha hecho, qué está comprobado y qué falta. Se actualiza en cada cambio |
| `originales/`, `fusion/` | Las dos apps de partida y el plan de la fusión. Solo de consulta: no se modifican |

## Normas principales

Están completas en `app/CLAUDE.md`. Lo imprescindible:

- **Textos en español de España, tuteando.** Todo texto visible pasa por `t()` / `tn()` de `src/i18n` (el español es
  la clave) y se traduce en los tres catálogos. Comprueba con `npm run i18n`.
- **Colores** siempre de `useColors()` (`src/theme.ts`), nunca fijos. Tema claro por defecto y oscuro.
- **Cálculos** en `src/domain/`, como funciones puras con pruebas. Un número nunca sale de la interfaz ni de una IA.
- **Base de datos:** una migración aplicada no se edita; se añade otra en `src/db/migrations.ts`.
- **Web:** diálogos con `appAlert` (nunca `Alert.alert`); lo que solo existe en el móvil, detrás de `isWeb`.
- **Secretos:** nunca en la app ni en `EXPO_PUBLIC_*` (en la web se leen). La clave de Anthropic solo en `server/.env`.
- **Salud:** no diagnosticar, no recomendar entrenar con dolor, no dietas extremas.

## Decisiones recientes que conviene saber

- **Nombre:** la app se llama IKYNDO (iconos sacados del logo). `slug` (`smart-fitness-coach-app`) y `scheme` no se
  han cambiado para no romper tu build del App Store.
- **IA apagada:** `AI_ENABLED` (`app/src/lib/features.ts`) esconde todo lo de IA (foto y texto de comidas, permiso,
  cupo). Las comidas entran por código de barras, favoritas o a mano. El servidor va sin clave de Anthropic, así
  que no hay gasto. Para encenderla harían falta `EXPO_PUBLIC_AI=on` al compilar y la clave en el servidor: hablarlo
  antes, porque cada análisis cuesta dinero.
- **Web en dos partes:** presentación en HTML en `/` y la app en `/app` (`experiments.baseUrl: "/app"` en
  `app/app.json`). `baseUrl` solo afecta a la web, no a iOS ni Android.
- **Sin Expo Go en las guías:** se trabaja con la web y con builds de EAS. El código sigue siendo nativo.
- **Selectores de cristal** (`app/src/components/Picker.tsx`) con `expo-blur`.

## Para la app del App Store

En tu `eas.json`, la dirección del servidor:

```
EXPO_PUBLIC_API_URL=https://ikyndo.tech/api
```

Con la IA apagada la app no envía nada a Anthropic. El resto de pasos (bundle id, TestFlight, privacidad) está en
`DESPLIEGUE.md`, apartado «Después: la app en el App Store».

## Cómo trabajamos los dos sin pisarnos

1. Antes de empezar, `git pull` en `main`.
2. Cada cambio en su rama (`git checkout -b marc/lo-que-sea`), con commits pequeños y en español.
3. Antes de subir: `npm run check` y `npm run i18n` en verde (y `npm test` en `server/` si lo has tocado).
4. Apunta en `app/docs/ESTADO.md` qué has hecho y qué has comprobado.
5. Sube la rama y abre un pull request hacia `main`; el otro le echa un vistazo y se fusiona. Nada de `push --force`
   a `main`.
6. Si tocáis los mismos archivos a la vez (catálogos de traducción, `app.json`), avisaos antes.

## Publicar en el VPS

Lo hace Miquel desde su PC con `deploy\subir.ps1` (copia lo último confirmado y reconstruye). Si quieres publicar tú,
pásale tu clave SSH pública y usa el mismo script (Windows) o, a mano, lo de `DESPLIEGUE.md`. El script sube lo
último confirmado en tu copia: publica siempre desde `main` al día (`git pull` antes) para no pisar lo del otro.
