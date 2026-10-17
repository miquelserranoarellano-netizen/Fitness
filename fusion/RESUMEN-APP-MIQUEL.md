# Smart Fitness Coach (app de Miquel): resumen para combinarla

> Esta carpeta lleva **el código completo** de la app (`smart-fitness-coach-app/`, unos 2 MB, sin
> `node_modules`) y este resumen. Está pensado para quien vaya a unirla con la app de fotos de comida.
> Copiado el 17 de octubre de 2026.

## En una frase

Entrenador personal de **hipertrofia** para el móvil: genera la rutina a partir del perfil, guía cada sesión
serie a serie, sigue el peso y las medidas, calcula **cuánto** comer (calorías y macros) y revisa cada semana
qué conviene ajustar. Todo con **reglas explícitas** (sin IA), sin cuenta y sin servidor: los datos se guardan
en el propio teléfono.

**La nutrición está a medias a propósito**: la app sabe *cuánto* hay que comer, pero *qué* se ha comido lo
tiene que aportar la app de fotos del amigo. Ese hueco ya está preparado (ver el apartado 6).

## 1. Tecnología

| Pieza | Versión |
| --- | --- |
| Expo (se abre con **Expo Go**) | SDK **57** (`expo ~57.0.30`) |
| React Native / React | 0.86.3 / 19.2.3 |
| Navegación | Expo Router (rutas por archivos en `src/app/`, rutas tipadas) |
| Lenguaje | TypeScript 6 estricto, React Compiler activado |
| Base de datos | **SQLite local** (`expo-sqlite`), archivo `smart-fitness-coach.db` |
| Validación | Zod 4 |
| Iconos y gráficos | `lucide-react-native`, gráficos SVG propios (`react-native-svg`) |
| Pruebas | Vitest (59 pruebas; la base de datos se prueba con `node:sqlite`) |

Alias de importación: `@/…` apunta a `src/…`.

## 2. Ponerla en marcha

Hace falta **Node 22 o superior** (se ha usado Node 24 LTS).

```bash
cd smart-fitness-coach-app
npm ci          # instala exactamente las mismas dependencias (package-lock.json)
npm start       # muestra un QR: escanearlo con Expo Go (SDK 57) en la misma wifi
npm run check   # tipos + lint + pruebas
```

- `npm run web` abre una vista en el navegador para revisar pantallas (ahí no funcionan los diálogos de
  confirmación).
- Si se trabaja en WSL/Ubuntu, copiar la carpeta dentro de Linux (p. ej. `~/proyectos`), no en `/mnt/...`.
  El `README.md` del proyecto explica cómo hacer que el móvil vea WSL (red «mirrored»).
- **No se ha probado todavía en un móvil real**, solo en la vista web.

## 3. Qué hace (pantallas)

Barra inferior: **Inicio · Entreno · Nutrición · Cuerpo · Más**.

| Pantalla | Archivo en `src/app/` | Contenido |
| --- | --- | --- |
| Cuestionario | `bienvenida.tsx` | 9 pasos: datos, objetivos, experiencia, lesiones, disponibilidad, hábitos y alimentación |
| Informe inicial | `informe-inicial.tsx` | Nivel, rutina y su porqué, volumen por músculo, objetivo nutricional |
| Inicio | `(tabs)/inicio.tsx` | Tareas pendientes, entreno de hoy, racha, recomendación, peso, nutrición, puntos fuertes y débiles |
| Entreno | `(tabs)/entrenamiento.tsx` | Rutina semanal y justificación del bloque |
| Modo entrenamiento | `sesion/[id].tsx` | Series con peso, repeticiones y RIR, carga sugerida, descanso con vibración, molestias |
| Ficha de ejercicio | `ejercicio/[id].tsx` | Técnica, errores, consejos, alternativas y progresión (66 ejercicios) |
| Nutrición | `(tabs)/nutricion.tsx` | Objetivo diario, ajuste según el peso y **el hueco «Lo que comes hoy»** |
| Cuerpo | `(tabs)/cuerpo.tsx` | Peso con tendencia, medidas comparadas, fotos de progreso privadas |
| Historial, análisis, revisiones | `historial/`, `analisis.tsx`, `revisiones/` | Sesiones, puntos fuertes y débiles, revisión semanal y mensual |
| Perfil | `perfil.tsx` | Editar datos, alergias, nueva rutina, exportar (JSON) y borrar datos |

Diseño: **oscuro**, fondo `#08090a`, un único acento **lima** `#c2f25c`. Colores, espacios y tamaños en
`src/theme.ts`; botones, tarjetas y formularios en `src/components/`.

## 4. Cómo está organizado el código

```
smart-fitness-coach-app/
  src/
    app/            Pantallas (Expo Router)
    domain/         Motor de reglas: CÁLCULOS PUROS con pruebas, sin base de datos
      exercises/      catálogo de 66 ejercicios (push, pull, legs)
      training/       nivel, generador de rutina, progresión de cargas, siguiente bloque
      body/           tendencia del peso, medidas
      nutrition/      targets.ts: calorías y macros, y su ajuste
      analysis/       volumen por músculo, puntos débiles
      review/         revisión semanal y mensual
    data/           Lectura/escritura en SQLite por área + services.ts (operaciones de varias tablas)
                    + provider.tsx (useQuery / useMutation para las pantallas)
    db/             migrations.ts (esquema), expo.ts (SQLite del móvil), node.ts (para pruebas)
    integrations/
      nutrition/    ← EL PUNTO DE UNIÓN con la app de fotos (contrato + guardado)
    features/       Formularios del cuestionario y del perfil
    components/     UI común y gráficos
    lib/            Fechas, unidades, formato, ids
  docs/
    INTEGRACION-NUTRICION.md   Contrato detallado con la app de fotos
    ESTADO.md                  Qué está hecho y qué falta probar
  CLAUDE.md, AGENTS.md         Normas para la IA que trabaje en el proyecto
```

Unas 14.500 líneas de TypeScript en ~80 archivos.

**Cómo leen y escriben las pantallas**: `useQuery(db => …)` para leer y `useMutation().run(db => …)` para
escribir. Tras cada escritura se refrescan todas las pantallas abiertas.

## 5. Datos (SQLite en el teléfono)

Un solo usuario por teléfono (no hay `user_id`). Fechas `AAAA-MM-DD`, instantes ISO 8601, kg y cm, listas en
JSON como texto, booleanos 0/1.

| Área | Tablas |
| --- | --- |
| Perfil | `profiles` (una fila: objetivos, disponibilidad, **dieta, alergias, alimentos excluidos**…), `limitations` |
| Cuerpo | `body_weights`, `body_measurements`, `progress_photos` |
| Entrenamiento | `training_blocks` → `plan_days` → `plan_exercises`; `workout_sessions` → `session_exercises` → `workout_sets` |
| Nutrición | `nutrition_targets` (historial del objetivo), **`food_entries` (las comidas que llegan de la app de fotos)** |
| Revisiones | `weekly_checkins`, `monthly_reports`, `recommendations` |
| Otros | `app_state` |

Las migraciones están en `src/db/migrations.ts`. **Una migración aplicada no se edita**: para tablas nuevas
(p. ej. las de la app de fotos) se añade la versión 2 al final de la lista.

## 6. El punto de unión: la nutrición

| Esta app | La app de fotos |
| --- | --- |
| Calcula **cuánto** comer: kcal, proteína, hidratos y grasas (`src/domain/nutrition/targets.ts`) | Dice **qué** se ha comido y sus kcal y macros a partir de una foto |
| Ajusta el objetivo (±125 kcal) según la tendencia real del peso | — |
| Compara lo comido con el objetivo en Inicio y Nutrición | — |
| Guarda alergias, tipo de dieta y alimentos excluidos | Puede usarlos para avisar de alérgenos |

### Lo único que necesita: comidas con esta forma

Definido y validado con Zod en `src/integrations/nutrition/contract.ts`:

```ts
{
  externalId: string;        // id de la comida en la app de fotos (reenviarla no la duplica)
  eatenAt: string;           // ISO 8601 con zona, p. ej. "2026-10-17T14:05:00+02:00"
  date?: string;             // "AAAA-MM-DD"; si falta, el día local de eatenAt
  name: string;              // "Arroz con pollo"
  calories: number;          // kcal (0-10000)
  proteinG?: number | null;  // gramos, opcional
  carbsG?: number | null;
  fatG?: number | null;
  photoUri?: string | null;  // ruta local de la foto, opcional
}
```

### Opción A · Unir las dos apps en una (la recomendada)

Llevar las pantallas de la app de fotos a `src/app/` (por ejemplo `src/app/foto-comida.tsx`) y, al terminar
de analizar una foto, guardar el resultado:

```ts
import { useMutation } from "@/data/provider";
import { saveFoodEntries } from "@/integrations/nutrition/store";

const { run } = useMutation();
await run((db) => saveFoodEntries(db, "app-fotos", [comida]));
```

Con eso, Inicio y Nutrición ya muestran lo comido frente al objetivo **sin tocar nada más**. El recuadro
«Lo que comes hoy» de Nutrición es el sitio natural para poner el botón de hacer la foto.

### Opción B · Dos apps separadas

Implementar la interfaz `NutritionSource` (`id`, `label`, `fetchDay(date)`) que traiga las comidas de la otra
app, registrarla en `src/integrations/nutrition/sources.ts` y llamar a `saveFoodEntries` con lo que devuelva.

## 7. Lista para la fusión (preguntas sobre la app del amigo)

- [ ] **¿Es Expo / React Native?** Si sí, Opción A. Si es otra cosa (Flutter, nativa, web), Opción B.
- [ ] **¿Qué versión del SDK de Expo usa?** Expo Go solo abre una versión: hay que llevarlo todo al **SDK 57**.
- [ ] **¿Usa módulos que no están en Expo Go?** (p. ej. `react-native-vision-camera`). Si es así, ya no
      bastaría con Expo Go y haría falta una *development build*. Esta app solo usa módulos de Expo Go
      (cámara y galería con `expo-image-picker`).
- [ ] **¿Cómo reconoce la comida?** Si llama a una IA o API con clave (OpenAI, Claude, etc.), **la clave no
      puede ir dentro de la app**: haría falta un pequeño servidor que la guarde. Esta app no tiene servidor.
- [ ] **¿Dónde guarda sus datos?** (AsyncStorage, otra SQLite, un servidor…). Lo ideal es que sus comidas
      acaben en `food_entries` y, si necesita tablas propias, añadirlas con una migración nueva.
- [ ] **Dependencias**: añadir las suyas con `npx expo install <paquete>` (elige la versión compatible con el
      SDK 57), no con `npm install` a secas.
- [ ] **Diseño**: adaptar sus pantallas a `src/theme.ts` y a los componentes de `src/components/` para que
      todo parezca una sola app.

Decisiones que quedan abiertas (de `docs/INTEGRACION-NUTRICION.md`):

- Si una comida se puede editar o borrar desde esta app (hoy solo se lee).
- Si se guardan las fotos de comida o solo los números.
- Si la proteína realmente comida se usa en algo más que la barra de progreso (por ejemplo en la revisión
  semanal, que hoy pregunta el cumplimiento de la dieta del 1 al 5).

## 8. Normas del proyecto que conviene respetar

- Las cifras salen **siempre** de `src/domain/` (reglas con pruebas), nunca de la interfaz.
- Nada que parezca funcionar sin funcionar: si algo no está conectado, se dice en pantalla.
- Salud: no diagnosticar y no recomendar entrenar con dolor.
- Textos de la interfaz en español de España, tuteando.

## 9. Estado

| Hecho y comprobado | Falta |
| --- | --- |
| Todas las pantallas; tipos, lint y 59 pruebas correctos; el paquete de Android compila; `expo-doctor` 21/21; recorrido completo en la vista web | Probarla en un móvil real con Expo Go (aspecto, teclado, vibración, cámara, compartir la exportación) |
| Contrato de nutrición con pruebas (guardar comidas de la «app-fotos» y sumarlas por día) | Conectar la app de fotos |
| Exportación de todos los datos en JSON | Importación de datos |
