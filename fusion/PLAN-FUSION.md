# Plan de fusión: Smart Fitness Coach + SnapCal

Estado: **aprobado el 17/10/2026. Fases 2 a 5 hechas** (ver `app/docs/ESTADO.md`). Siguiente: fase 6. Sigue `PROMPT-FUSION-APPS.md`.

## Decisiones de Miquel (17/10/2026)

| Pregunta | Respuesta | Consecuencia |
| --- | --- | --- |
| Idiomas | **ES, EN, FR y DE** | Sistema de traducciones para toda la app (las pantallas de Miquel también). Los textos que genera el motor (porqués de la rutina, informes, avisos) y el catálogo de 66 ejercicios pasan a claves traducibles. Las cifras no cambian. FR y DE necesitarán revisión de un nativo |
| Suscripción | **Quitarla de momento** | Fuera `paywall`, `purchases.ts`, `access.ts` y `react-native-purchases`. Todo gratis |
| Tema | **Oscuro y claro** | `src/theme.ts` pasa de colores fijos a un tema por contexto (sistema, claro, oscuro) con una paleta clara nueva, comprobada en contraste |
| Comidas | **Editar, borrar y guardar foto** | Se pueden corregir y borrar. La foto se copia a la carpeta privada de la app (como las fotos de progreso) y se borra con la comida |

Normas que cambian respecto al `CLAUDE.md` de Miquel: los textos ya no son solo en español; el resto se mantiene.

## Carpeta

```
~/proyectos/Appcombinada/
  app/          la app combinada (empieza como copia de smart-fitness-coach-app)
  server/       el servidor de SnapCal (Express + Claude + USDA/Open Food Facts)
  originales/   copias intactas de las dos apps, solo de consulta (ya creadas)
  fusion/       los dos resúmenes, el prompt y este plan (ya creados)
  CLAUDE.md     normas de la app combinada
  README.md     cómo arrancar la app y el servidor
```

## Pantallas

Barra inferior: **Inicio · Entreno · Nutrición · Cuerpo · Más**.

| Pantalla | De dónde sale | Qué cambia |
| --- | --- | --- |
| Inicio | Miquel | + anillo de calorías (comido / objetivo), proteína y **botón grande de foto** |
| Entreno, sesión, ficha, historial | Miquel | Sin cambios |
| Nutrición | Miquel + SnapCal | Objetivo y ajuste (Miquel) + comidas del día, tira semanal, agua y pasos (SnapCal) + botones foto · texto · código · favoritas |
| Nutrición → Progreso | SnapCal «Progreso» | Calendario del mes, media de 7 días y resumen semanal de la comida. La gráfica de peso no: ya está en Cuerpo |
| Comida: foto, texto, código, resultado, favoritas | SnapCal | Rehechas con `src/theme.ts`, `src/components/` e iconos lucide; guardan con `saveFoodEntries` |
| Cuerpo | Miquel | El peso que se apunta desde cualquier sitio va al mismo `body_weights` |
| Más / Perfil | Miquel + SnapCal | + recordatorios de comidas y agua, objetivo de pasos y agua, importar datos |
| Cuestionario | Los dos | Uno solo (ver abajo) |

## Datos: migración 2 (SQLite)

- `food_entries`: columnas nuevas de fibra, azúcar, sodio, margen de calorías (mín./máx.) y notas. `source` indica
  cómo se registró: `foto`, `texto`, `codigo`, `favorita`.
- `food_entry_items` (nueva): los alimentos de cada comida con gramos, kcal, macros y origen del dato
  (USDA, Open Food Facts o estimación de la IA).
- `favorite_meals` (nueva), `water_logs` (ml por día) y `step_logs` (pasos por día, manual o podómetro).
- `profiles`: peso deseado (opcional) y estilo de macros (`normal`, `low-carb`, `keto`).
- Ajustes (recordatorios, objetivos de pasos y agua, calorías sobrantes sí/no) en `app_state`.
- AsyncStorage desaparece: la app combinada empieza sin datos.

## Una sola fuente para cada cifra

- El objetivo de kcal y macros es el de `src/domain/nutrition/targets.ts`. De `snapcal/lib/plan.ts` se traen,
  como funciones puras con pruebas: los **mínimos de kcal** (1500 / 1200 / 1350), el reparto **keto y low-carb** y
  las **calorías sobrantes** (máx. 200, desactivadas por defecto).
- Se descartan `computePlan` de SnapCal, su reparto fijo 25/50/25 y su factor de actividad del 1 al 5 (la web de
  Miquel calcula la actividad con el trabajo, los pasos y los entrenamientos).
- `stats.ts` y `weekly.ts` de SnapCal pasan a `src/domain/nutrition/intake.ts` con pruebas (totales por día, estado
  del día, racha de registros, resumen semanal).

## Cuestionario único

Base: los 9 pasos de Miquel (datos, objetivos, experiencia, ejercicios, disponibilidad, lesiones, medidas,
hábitos, alimentación). Se añade de SnapCal: peso deseado, estilo de dieta (keto/low-carb), permiso de
notificaciones y calorías sobrantes. Al final, el informe inicial con el anillo y los macros.

## Propongo descartar de SnapCal (dime si quieres conservar algo)

- Regalo con descuento, «¿dónde nos conociste?», «¿has probado otras apps?», gráfica de marketing y pantallas
  motivacionales (más sencillo, bloqueos, deseos, gracias, potencial).
- Inicio de sesión con Apple, Google o correo y código de referido: **solo son interfaz**, parecen funcionar y no
  funcionan.
- Apple Health: no se puede en Expo Go.
- Dietas que solo son una etiqueta (equilibrada, mediterránea, paleo…): no cambian ningún cálculo. Se quedan
  vegetariana, vegana y pescetariana (ya están en el perfil) y keto/low-carb.
- Macros editables a mano: contradicen «una sola fuente»; se puede añadir después como objetivo «manual».
- Pantalla de inicio animada (se usa la de Expo) y exportar en CSV (se exporta todo en JSON y se añade importar).

## Que las dos partes se hablen

1. **Objetivo según el entreno** (propuesta): los días de entreno (planificados o con sesión hecha), +10 % de
   kcal, todo en hidratos; los de descanso, menos, de forma que **la media semanal sea la misma**. Proteína y grasa
   iguales y nunca por debajo del mínimo.
2. **Revisión semanal**: con 4 días o más registrados, el cumplimiento de la dieta sale de lo comido (días a ±10 %
   de las kcal y con ≥90 % de la proteína) y no se pregunta; con menos, se pregunta del 1 al 5 como ahora.
3. **Ajuste de ±125 kcal**: usa ese cumplimiento real. Si no se ha comido lo previsto, no se toca el objetivo.
4. **Alergias y alimentos excluidos**: el servidor recibe la lista y la IA marca los alimentos sospechosos; además,
   la app busca palabras clave. Se avisa como «posible», sin bloquear.
5. **Análisis**: hallazgos de nutrición con reglas (p. ej. «4 de los últimos 7 días por debajo de la proteína»).
6. **Calorías quemadas: no las sumo.** El factor de actividad ya cuenta los entrenamientos; sumarlas otra vez
   inflaría el objetivo.

## Riesgos que conviene saber ya

- **El móvil no llega al servidor dentro de WSL** (el mismo problema que con Expo, puerto 8081). Hará falta la red
  «mirrored» de WSL y abrir también el puerto 3000, o alojar el servidor fuera.
- **Clave de Anthropic**: sin `ANTHROPIC_API_KEY` en `server/.env` no funcionan la foto ni el texto. El código de
  barras sí funciona sin ella.
- Los recordatorios en Android con Expo Go pueden no funcionar; los pasos automáticos solo existen en iPhone.
- SnapCal usa la API antigua de `expo-image-manipulator` y versiones `*` en sus dependencias: se adaptan a SDK 57
  con `npx expo install`.

## Fases

1. Plan y visto bueno ✔
2. Base: `app/` desde la app de Miquel, tema claro/oscuro y sistema de traducciones (español completo); fuera la
   suscripción ✔
3. Migración 2 y capa de datos de nutrición, con pruebas ✔
4. Servidor (`server/`) y cliente de la API (`src/lib/api.ts`) ✔
5. Pantallas de foto, texto, código de barras, resultado y favoritas (ya con traducciones y tema), con los textos de
   permiso de cámara y fotos corregidos ✔ ← siguiente: 6
6. Inicio y Nutrición con datos reales
7. Cuestionario único y perfil
8. Conexiones entre entreno y nutrición
9. Agua, pasos, recordatorios, exportar e importar
10. Traducción a EN, FR y DE de todo: pantallas, textos del motor y catálogo de ejercicios

Cada fase termina con `npm run check` en verde y un resumen de qué probar en el móvil.

## Copias de seguridad

`originales/` guarda las dos apps intactas (solo en local: no se sube). El resto está en git y en GitHub
(repositorio privado Fitness, rama `main`), con un commit por fase como punto de vuelta.
