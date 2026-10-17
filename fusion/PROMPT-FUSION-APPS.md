# Prompt: fusionar Smart Fitness Coach (Miquel) + SnapCal (Marc)

> Pega todo lo que hay debajo de la línea en Claude Code (o la IA que uséis), abierto en una carpeta que
> contenga **las dos apps**: `smart-fitness-coach-app/` y `snapcal/`. Adjunta también los dos resúmenes
> (`RESUMEN-APP-MIQUEL.md` y `RESUMEN_SnapCal.md`).

---

Quiero fusionar dos apps en **una sola app** de móvil: un entrenador de gimnasio que además lleva la dieta
con fotos de la comida. Tienes el código de las dos en esta carpeta y un resumen técnico de cada una.

- **`smart-fitness-coach-app/`** (Miquel): entrenador de hipertrofia. Genera la rutina, guía cada sesión
  serie a serie, sigue peso y medidas, calcula **cuánto** comer (kcal y macros) y hace revisiones semanales
  y mensuales. Reglas explícitas, sin IA, datos en **SQLite** local. Ya tiene preparado el hueco de
  nutrición: el contrato `src/integrations/nutrition/contract.ts`, la función `saveFoodEntries` y la tabla
  `food_entries`.
- **`snapcal/`** (Marc): control de calorías. Foto del plato → Claude (visión) reconoce los alimentos →
  el servidor calcula kcal y macros con USDA y Open Food Facts. También texto, código de barras, agua,
  pasos, favoritos, recordatorios, progreso y suscripción. Datos en **AsyncStorage** y un servidor
  Node/Express con la clave de Anthropic.

Las dos usan **Expo SDK 57, React Native 0.86, React 19, TypeScript y expo-router**, así que se puede hacer
una fusión real en un solo proyecto (la «Opción A» del resumen de Miquel).

## Antes de tocar nada

1. Lee los dos resúmenes, `smart-fitness-coach-app/CLAUDE.md`, `AGENTS.md`, `docs/INTEGRACION-NUTRICION.md`
   y `docs/ESTADO.md`, y recorre el código de las dos apps.
2. Haz una **copia de seguridad** o una rama git de cada proyecto antes de cambiar nada.
3. Entrégame un **plan de fusión** (pantallas, datos, qué se reutiliza, qué se descarta y por qué) y
   **espera mi visto bueno** antes de empezar a mover código. Pregúntame lo que no esté claro.

## Decisiones de base (salvo que veas un problema grave y me lo digas)

- **El proyecto base es `smart-fitness-coach-app/`**. Las pantallas y la lógica de SnapCal se llevan a
  `src/app/`, `src/domain/`, `src/data/`, etc. Se respetan las normas de su `CLAUDE.md`.
- **Una sola base de datos: SQLite.** Lo que SnapCal guarda en AsyncStorage pasa a SQLite. Las comidas van
  a `food_entries` mediante `saveFoodEntries`; lo que no encaje (alimentos de cada comida, fibra, azúcar,
  sodio, agua, pasos, favoritos, recordatorios) va en tablas nuevas añadidas con una **migración nueva
  (versión 2)** al final de `src/db/migrations.ts`. Nunca edites una migración ya aplicada.
- **Una sola fuente para cada cifra.** El objetivo de kcal y macros sale de `src/domain/nutrition/targets.ts`.
  Si `snapcal/app/lib/plan.ts` tiene algo que falta (dietas keto/low-carb, mínimos de kcal, calorías
  sobrantes), pásalo a `src/domain/` como función pura **con pruebas**, sin duplicar el cálculo.
- **Un solo perfil y un solo historial de peso**: `profiles` y `body_weights`. Fusiona los dos
  cuestionarios iniciales (9 pasos + ~30 pasos) en uno, sin preguntas repetidas y sin alargarlo de más.
- **El servidor de SnapCal se mantiene** (la clave de Anthropic no puede ir dentro de la app). La app
  combinada lo llama con `src/lib/api.ts` (o similar). Si el servidor no responde, la pantalla lo dice
  claramente y deja añadir la comida a mano: nada que parezca funcionar sin funcionar.
- **Dependencias** con `npx expo install <paquete>`. Mantén la app compatible con **Expo Go** (nada de
  módulos nativos que no estén en Expo Go).
- **Diseño**: todo con `src/theme.ts` y `src/components/` (oscuro, acento lima `#c2f25c`). Rehaz las
  pantallas de SnapCal con esos componentes para que parezca una sola app. Los gráficos de SnapCal
  (anillo de calorías, tira semanal) se adaptan al tema.

## Cómo quiero que quede

**Barra inferior:** Inicio · Entreno · Nutrición · Cuerpo · Más.

- **Inicio**: entreno de hoy + anillo de calorías del día (comido frente a objetivo) + proteína + racha y
  recomendación. Un botón grande y visible para **hacer foto a la comida**.
- **Nutrición**: el recuadro «Lo que comes hoy» se llena con las comidas reales. Desde ahí: foto, texto,
  código de barras y favoritos (pantallas de SnapCal: `scan`, `result`, `describe`, `barcode`, `saved`).
  Al guardar una comida se llama a `saveFoodEntries` y Inicio y Nutrición se actualizan solas.
  Agua y pasos también aquí.
- **Entreno** y **modo entrenamiento**: como en la app de Miquel.
- **Cuerpo**: peso (un solo historial), medidas y fotos de progreso.
- **Más**: perfil, ajustes (recordatorios de SnapCal incluidos), exportar e importar datos, borrar datos.

## Que las dos partes se hablen (lo importante)

1. **Objetivo del día según el entreno**: más kcal e hidratos los días de fuerza, menos los de descanso,
   con la regla definida en `src/domain/` y con pruebas.
2. **Proteína real**: la revisión semanal usa la proteína y las kcal realmente comidas (de `food_entries`)
   en lugar de preguntar el cumplimiento del 1 al 5, o además de preguntarlo.
3. **Ajuste por peso**: el ajuste de ±125 kcal según la tendencia del peso tiene en cuenta si se ha cumplido
   la dieta (si no se ha comido lo previsto, no tiene sentido cambiar el objetivo).
4. **Alergias y alimentos excluidos** del perfil: al analizar una foto, si aparece un alérgeno o un
   alimento excluido, avisar.
5. **Análisis y puntos débiles**: incluir la nutrición (por ejemplo, «llevas 4 días por debajo de la
   proteína»).
6. **Calorías quemadas**: solo si se puede estimar con una regla razonable a partir de las series; si no,
   no inventes la cifra.

## Lo que tienes que preguntarme (no lo decidas tú)

- **Idiomas**: ¿solo español de España (como la app de Miquel) o mantenemos ES/EN/FR/DE de SnapCal?
- **Suscripción (RevenueCat)**: ¿la mantenemos, qué queda gratis y qué es de pago, o la quitamos de momento?
- **Tema claro**: ¿solo oscuro o también claro?
- **Comidas**: ¿se pueden editar y borrar después de guardarlas? ¿Guardamos las fotos o solo los números?
- Cualquier cosa de SnapCal que no encaje bien y pienses descartar.

## Cómo trabajar

- Por fases pequeñas, y al final de cada una `npm run check` (tipos + lint + pruebas) en verde:
  1. Plan y visto bueno.
  2. Migración v2 y capa de datos de nutrición (con pruebas).
  3. Servidor y cliente de la API.
  4. Pantallas de foto, texto, código de barras, resultado y favoritos.
  5. Inicio y Nutrición con datos reales.
  6. Cuestionario único y perfil.
  7. Conexiones entre entreno y nutrición (la lista de arriba).
  8. Agua, pasos, recordatorios, exportar e importar.
- Pasa a pruebas la lógica útil de SnapCal (`stats.ts`, `weekly.ts`, `plan.ts`) al moverla a `src/domain/`.
- Actualiza `README.md` (cómo arrancar la app **y** el servidor) y `docs/ESTADO.md`.
- Textos en español de España, tuteando. Salud: no diagnosticar, no recomendar entrenar con dolor, no
  dietas extremas (respeta los mínimos de kcal).
- Al acabar cada fase, dime en pocas líneas qué has hecho, qué falta y qué tengo que probar en el móvil
  con Expo Go.
