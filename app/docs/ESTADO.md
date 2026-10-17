# Estado de la app

Última actualización: 17 de octubre de 2026 · Fusión con SnapCal en curso (fase 4 de 10 hecha).

## Fusión con SnapCal

| Fase | Contenido | Estado |
| --- | --- | --- |
| 1 | Plan y decisiones (`../fusion/PLAN-FUSION.md`) | Hecha |
| 2 | Base: tema claro/oscuro, sistema de traducciones, preferencias de tema e idioma (en «Más») | Hecha |
| 3 | Migración 2 y capa de datos de nutrición (comidas con alimentos, favoritas, agua, pasos, ajustes, dieta) | Hecha |
| 4 | Servidor (`../server/`) y cliente de la API (`src/lib/api.ts`, `api-config.ts`, `photo-prep.ts`) | Hecha |
| 5-10 | Pantallas de comida, Inicio y Nutrición, cuestionario único, conexiones, agua y pasos, traducción | Pendientes |

**Fase 4, comprobado (17/10/2026):** en `server/`, **29 pruebas** con `node --test` (rutas, errores, token, límite
de peticiones, esquema y búsquedas, con un cliente de Anthropic y bases de datos falsos). En `app/`, `npm run
check` con tipos, lint y **104 pruebas** (16 nuevas del cliente: peticiones, traducción de la respuesta, cada
código de error, tiempo agotado, cancelación y dirección del servidor). `expo export` para Android compila. Con el
servidor de verdad y sin clave: `/health` responde `{ ok: true, ai: false }`, el análisis de texto responde `503
ai_not_configured`, el código de barras de Nutella (3017620422003) trae sus cifras de Open Food Facts, uno que no
existe da `404 not_found` y la cabecera CORS está.

**Fase 4, sin probar:** el análisis real de una foto o un texto con Claude (no hay `ANTHROPIC_API_KEY` todavía);
el móvil hablando con el servidor dentro de WSL (hace falta la red «mirrored» y abrir el puerto 3000); la
preparación de fotos (`photo-prep.ts` usa Expo: se probará con las pantallas de la fase 5). Ninguna pantalla usa
todavía el cliente.

**Decisiones de la fase 4:**
- El servidor pide a Claude **salida estructurada** con un esquema JSON y la valida con Zod, en lugar de buscar el
  JSON dentro del texto. Comprueba antes si el modelo se negó o se quedó sin espacio.
- **Reintento en otro modelo si el modelo se niega** (`fallbacks: "default"`). Para quitarlo, dos líneas en
  `server/src/analysis.js`.
- Modelo por defecto `claude-sonnet-5-5` (el de Marc), configurable con `ANTHROPIC_MODEL`; esfuerzo opcional
  con `ANTHROPIC_EFFORT`.
- Errores con códigos estables (`ai_not_configured`, `ai_busy`, `not_found`…) que la app traduce a mensajes
  claros, en lugar del «Error 500» de antes. Un producto que no existe ya no se confunde con un fallo de red.
- El servidor recibe la lista de alergias y alimentos excluidos (`avoid`) y la IA marca en cada alimento los que
  podría contener; solo se aceptan avisos de esa lista. La app los usará en la fase 8.
- Sin clave de Anthropic el servidor arranca igual: el código de barras funciona y el resto avisa.
- La app busca el servidor en el mismo ordenador que le sirve el código, puerto 3000, salvo que se configure
  `EXPO_PUBLIC_API_URL` (`app/.env.example`). Con `--tunnel` hay que configurarlo.
- El token (`APP_TOKEN` / `EXPO_PUBLIC_APP_TOKEN`) se compara sin filtrar tiempos y se comprueba antes de leer el
  cuerpo. Dentro de la app no es un secreto: solo frena a curiosos.

**Fase 3, comprobado (17/10/2026):** `npm run check` con tipos, lint y **88 pruebas** (24 nuevas: 9 del dominio
de nutrición y 15 de la capa de datos, incluida la actualización de una base de datos de la versión 1 con datos).
`expo export` para Android compila y `expo-doctor` 21/21. En la vista web (SQLite real de Expo): se creó una base de
datos en la versión 1 con un dato, se pasó a la 2 y el dato seguía ahí, sin errores.

**Fase 3, sin probar:** la migración en un móvil real; las fotos de comidas (`meal-photos.ts` usa el sistema de
archivos del teléfono y no tiene pruebas automáticas: se probará con las pantallas en la fase 5). Ninguna
pantalla usa todavía las tablas nuevas.

**Fase 3, a tener en cuenta:** los datos de prueba que se crearon en la vista web durante la fase 2 no estaban
al empezar la fase 3 (la base de datos del navegador se había quedado vacía entre las dos sesiones). La migración
no borra nada (solo añade tablas y columnas) y la persistencia en web funcionó al recargar y al reiniciar el
servidor; la causa no se ha podido determinar. SQLite en web es experimental: el móvil es la referencia.

**Decisiones de la fase 3:**
- Las comidas de la app (foto, texto, código, favorita) entran por el mismo `saveFoodEntries` que antes era
  solo para otra app; `externalId` pasa a ser opcional y se devuelve el id de cada comida guardada.
- Mínimos de calorías de SnapCal (1500 hombre, 1200 mujer, 1350 sin indicar): el objetivo nunca baja de ahí, ni al
  calcularlo ni al aplicar un ajuste (antes el ajuste tenía un mínimo fijo de 1200).
- Repartos bajo en hidratos (25 % de las kcal) y cetogénico (5 %) en el perfil (`macro_style`); solo cambian
  hidratos y grasa, no las calorías ni la proteína. Peso deseado opcional (`target_weight_kg`), en la dirección
  del objetivo.
- La exportación pasa al formato `appcombinada/exportacion@2` con las tablas nuevas.
- Favoritas: como mucho 100 (se conservan las más recientes), sin duplicar mismo nombre y calorías.

**Fase 2, comprobado (17/10/2026):** `npm run check` con tipos, lint y **64 pruebas** (las 59 de antes y 5 de las
traducciones); `npx expo export --platform android` compila; `expo-doctor` 21/21. En la vista web a tamaño de móvil:
cuestionario completo, informe inicial, Inicio, Más y modo entrenamiento, en claro y en oscuro; el tema «Sistema»
cambia en vivo con el del teléfono y la elección «Oscuro» o «Claro» se conserva al recargar. Sin errores en la consola.

**Fase 2, sin probar:** en un móvil real; el cambio de idioma (solo hay español hasta la fase 10, así que la
navegación no se ha tenido que volver a montar todavía).

**Decisiones de la fase 2:**
- Paleta clara nueva con contraste comprobado; el gris `subtle` del modo oscuro sube de `#6c7078` a `#80848c` porque
  no llegaba a 4,5:1. Los colores de los gráficos son los mismos en los dos modos (pasan el validador de daltonismo).
- La pantalla de inicio (splash) sigue oscura en los dos modos: el icono es blanco y no se vería sobre claro.
- El idioma solo ofrece español hasta que existan los catálogos de EN, FR y DE; así no se muestra una app a medias.
- El selector de tema e idioma está en «Más» (más a mano que dentro del perfil).

---

Lo que sigue es el estado de la app de partida (15 de octubre de 2026).

## Qué hay

| Sección | Contenido | Estado |
| --- | --- | --- |
| Cuestionario inicial | Bienvenida y privacidad + 9 pasos de la web + resumen; el borrador se guarda en el teléfono | Hecho |
| Informe inicial | Nivel, rutina y su porqué, volumen por músculo, objetivo nutricional, medidas | Hecho |
| Inicio | Tareas pendientes, entrenamiento de hoy, cumplimiento y racha, recomendación, peso, nutrición, medidas, puntos fuertes y débiles | Hecho |
| Entreno | Rutina semanal, empezar sesión, volumen, justificación del bloque | Hecho |
| Modo entrenamiento | Series con peso, repeticiones y RIR, carga sugerida, temporizador de descanso con vibración, molestias, notas, cambiar ejercicio, terminar y descartar; pantalla siempre encendida | Hecho |
| Ficha de ejercicio | Técnica, errores, consejos, alternativas, progresión con gráfico | Hecho |
| Cuerpo | Peso con tendencia y gráfico, historial, medidas comparadas, fotos de progreso privadas (cámara o galería) | Hecho |
| Nutrición | Objetivo diario y su cálculo, ajuste según la tendencia, hueco para la app de fotos | **A medias a propósito** |
| Historial, análisis, revisiones | Como en la web (sin IA) | Hecho |
| Perfil | Edición por secciones, nueva rutina, recordatorios, lesiones, exportar y borrar datos | Hecho |

## Cómo se ha verificado

- `npm run check`: tipos (app y pruebas), lint y **59 pruebas**: las 47 del dominio de la web (sin las de comidas)
  y 12 de la base de datos local con un recorrido completo (cuestionario, plan, sesión con series, sustitución de
  ejercicio, revisiones, informe mensual, siguiente bloque, ajuste de calorías, comidas de la app de fotos,
  exportación y borrado).
- `npx expo export --platform android`: el paquete se genera y se compila a bytecode de Hermes (el motor de Expo
  Go). `npx expo-doctor`: 21/21 comprobaciones correctas.
- Recorrido en la **vista web** (Expo para navegador, a tamaño de móvil): cuestionario completo, informe inicial,
  inicio, sesión con 3 series, temporizador, cierre de sesión e historial, nutrición, revisión semanal con su
  informe y edición del perfil. Se corrigieron dos detalles de diseño encontrados ahí.

## Sin probar (dicho con claridad)

- **En un móvil real con Expo Go.** La vista web usa el mismo código, pero no es idéntica al móvil: falta
  comprobar en el teléfono el aspecto, el teclado, la vibración del descanso, la cámara y la galería, compartir
  la exportación y los diálogos de confirmación (que en web no funcionan).
- **Fotos de progreso**: escritas con las APIs del SDK 57, pero solo comprobadas con el compilador de tipos.
- **Conexión del móvil con WSL**: el túnel anónimo de Expo (`npm run tunnel`) **falló** al probarlo
  (`TypeError: Cannot read properties of undefined (reading 'body')` desde ngrok); puede funcionar con sesión
  iniciada (`npx expo login`). La alternativa recomendada es la red «mirrored» de WSL (pasos en el README), que
  cambia ajustes de Windows y por eso no se ha aplicado sin el usuario.

## Decisiones tomadas (revísalas)

1. **Datos en el teléfono, sin cuenta ni servidor**: funciona sin internet en el gimnasio y sin desplegar nada.
   La web y la app no comparten datos todavía; la exportación usa las mismas tablas para poder unirlos.
2. **Dominio copiado** de la web: más adelante conviene un paquete compartido para no mantenerlo dos veces.
3. **Sin IA en la app**: necesitaría un servidor para proteger la clave.
4. **«Hoy» es el día del teléfono** (la web usaba la zona de Madrid).
5. **Nutrición**: se queda el objetivo y su ajuste; se quitan menús, recetas, lista de la compra, equivalencias y
   registro manual. El hueco se llena con la app de fotos (`docs/INTEGRACION-NUTRICION.md`).
