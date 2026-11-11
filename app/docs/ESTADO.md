# Estado de la app

Última actualización: 10 de noviembre de 2026 · Preparada para el VPS (prueba web de un mes) · Fusión con SnapCal
en curso (fase 5 de 10 hecha).

## Portada de IKYNDO y Hostinger (11/11/2026)

- **Portada** (`../deploy/landing/`): página de presentación de IKYNDO con el logo y el aspecto de la app (colores
  de `src/theme.ts`, claro u oscuro según el sistema), sin JavaScript. Va en `tudominio.com` y «Entrar en la app»
  lleva a `app.tudominio.com`, donde está la app (Caddyfile con tres sitios: portada, `www` y `app`).
- **VPS:** Hostinger KVM 1 durante un mes; `../DESPLIEGUE.md` pasa de IONOS a Hostinger, con un apartado para
  acabar la prueba (quitar la renovación, exportar los datos antes de apagar).
- **Sin Expo Go:** fuera de las guías y scripts el uso con Expo Go (QR, WSL «mirrored», `npm run tunnel`). El código
  no cambia: la app del App Store sigue saliendo de aquí con EAS.
- **Nombre:** la app se llama IKYNDO (`app.json`, web, manifiesto, textos en los cuatro idiomas y nombres de los
  archivos exportados), con iconos sacados de la K del logo sobre negro. `slug` y `scheme` siguen igual para no
  romper la app del App Store del fork.
- **Comprobado:** la portada en local con las mismas cabeceras que Caddy (sin errores de CSP), en escritorio y en
  móvil, en claro y en oscuro. **Sin probar:** Caddy en el VPS (aquí no hay Docker).

## Fusión con la rama de la app del móvil (11/11/2026)

La app del móvil (repositorio `mdjoyanes/fitneesduo`, que sale del commit `30ecd7b` de este) y la del VPS vuelven a
tener el mismo código: se ha fusionado su rama con la de aquí. Trae el SDK 58, el cuestionario de 6 pasos con
selectores en lugar de escribir, la nutrición nueva con el botón flotante de cámara, el objetivo editable, el CSV,
los cuatro idiomas y su revisión de seguridad de fotos y archivos. Al fusionar se han juntado las dos revisiones de
seguridad (una sola cifra para el tope de notas: 400 caracteres), el importador de copias con el CSV en «Tus datos»
y el botón flotante con el permiso de la IA (sin permiso, el botón enseña antes el aviso y no abre la cámara).
- **Comprobado:** `npm run check` (161 pruebas), servidor con 45, `expo export` para Android y web (con el SDK 58
  la web se divide por pantallas y sigue funcionando con la CSP de Caddy), y en el navegador: Inicio con una base
  de datos anterior (la migración 3 se aplica sola), Nutrición con el anillo y el botón de cámara, el permiso de la
  IA antes de abrir la cámara y el selector de edad en Perfil.
- **Traducidos después:** los 129 textos nuevos de esta rama (permiso de la IA, servidor, importar copias, página
  de «no encontrada») ya están en inglés, francés y alemán; `npm run i18n` no da nada pendiente.

## Fallos, aspecto y rendimiento (11/11/2026)

- **Fallos encontrados con 7.500 perfiles al azar** (`src/domain/random.test.ts`): con poco material (solo banco,
  solo barra de dominadas o solo poleas) la rutina tenía días sin ningún ejercicio; ahora no se guarda y el
  cuestionario dice qué cambiar (`UnusablePlanError`). Con mucho peso la proteína se disparaba (más de 330 g) y los
  macros sumaban más que el objetivo; por encima de un IMC de 30 se calculan sobre un peso de referencia.
- **Seguridad:** segunda revisión en `../SEGURIDAD.md` (bloqueo tras códigos incorrectos, permiso antes de usar la
  IA, solo HTTPS fuera de la red local, tiempos máximos, sin `/_sitemap`).
- **Aspecto:** icono propio (mancuerna sobre verde, en lugar del de ejemplo de Expo), pantalla de carga en la web,
  contenido en una columna centrada en pantallas anchas, barra inferior de la web sin etiquetas cortadas, página
  de «no encontrada» en español y nombres en los campos para lectores de pantalla.
- **Rendimiento:** los iconos de lucide se importan uno a uno (`babel/lucide-direct-imports.js`): la web pasa de
  4,6 MB a 2,5 MB. Caddy sirve los archivos ya comprimidos con Brotli (`deploy/precompress.mjs`): 506 KB de
  descarga en vez de 2,5 MB.
- **Comprobado:** `npm run check` (139 pruebas), `expo export` para Android y web, servidor con 43 pruebas, y en el
  navegador: cuestionario, sesión con 3 series y terminarla, comida a mano, permiso de la IA, exportar e importar
  una copia, barra inferior en móvil y en ordenador.

## Inglés, francés y alemán (11/11/2026)

Los cuatro idiomas se pueden elegir en Más → Apariencia e idioma (o «Sistema»). Catálogos en `src/i18n/catalogs/`
con los 1.331 textos de la interfaz, las etiquetas (`labels()` en `domain/types.ts` y demás) y los 66 ejercicios
con sus consejos. Validaciones del cuestionario traducidas. `npm run i18n` dice si falta alguna traducción.
- **Siguen en español:** los textos que forma el motor con datos (por qué esta rutina, ajustes de calorías,
  informes semanales y mensuales) y algunos errores de la capa de datos. Es el resto de la antigua fase 10.
- **Comprobado:** `npm run check` (146 pruebas) y `npm run i18n` (nada pendiente).

## Nutrición nueva, menús, informe editable y CSV (11/11/2026)

A petición de Miquel tras probarla:
- **Nutrición rehecha** (`(tabs)/nutricion.tsx`, `src/features/nutrition/`): anillo de puntos con lo que queda
  (verde al llegar al 90-105 % del objetivo, rojo al pasarse), macros del día, agua por vasos, pasos del
  podómetro del móvil (`expo-sensors`; en iPhone el total del día, en Android desde que se abre la app; a mano en
  la web), calendario Día/Semana/Mes/Todo con días verdes y rojos, y «Escanea tu primera comida» hasta la
  primera comida con foto. Objetivo editable: calorías y reparto de macros en % (los gramos cuadran con las
  calorías); migración 3 para el motivo «manual».
- **Botón de la cámara** flotante en Nutrición, justo encima del icono de la pestaña y fijo al desplazar: abre la
  cámara directamente. La barra de abajo sigue con cinco pestañas (`floating` en `Screen`).
- **Regla de día cumplido**: entre el 90 % y el 105 % del objetivo de ese día (`dayStatus`, `GOOD_RANGE`).
- **Menús:** fuera «Historial» (lo cubre Análisis; el detalle de cada sesión sigue) y «Revisiones» del menú
  (siguen como aviso en Inicio cuando tocan).
- **Informe inicial editable:** «Cambiar» en datos/objetivo y en experiencia/días/material; al guardar se
  rehacen rutina y calorías (`updateProfileAndReplan`) y el informe enseña lo vigente.
- **CSV** (Perfil → Tus datos): resumen diario, comidas, entrenamientos y medidas, con «;» y coma decimal.
- **Comprobado:** `npm run check` (145 pruebas). **Por probar en el móvil:** podómetro y botón de la cámara.

## Expo SDK 58 (11/11/2026)

Para abrirla con el Expo Go actual del iPhone, que solo admite el SDK 58. React Native 0.88, React 19.3, expo-router
58 y el resto de módulos con las versiones del SDK (`expo install --fix`); `eslint-config-expo` 58 y `@types/react`
19.3. `package-lock.json` regenerado.
- **Cambios en el código:** solo `headerTransparent: false` en la pila (`_layout.tsx`): en iOS 26 la cabecera pasa
  a ser transparente por defecto y el contenido se metería por debajo. `web.output` ya era `"single"`, así que la
  web del VPS no cambia. No se usaba ninguna de las API retiradas (`InteractionManager`, `ImageBackground`,
  importaciones de `react-native/Libraries`, pestañas nativas…).
- **Node:** el SDK 58 pide Node 22.13+, 24.3+ o 26+ (no la 25).
- **Comprobado:** `npm run check` (129 pruebas), `expo export` para Android y web y `expo-doctor` (18 de 20: las dos
  que fallan necesitan conexión con Expo, que no había). `npm audit`: 5 avisos moderados, solo de herramientas de
  compilación. **Sin probar:** en el iPhone con Expo Go.

## Cuestionario inicial más corto y sin teclado (11/11/2026)

A petición: el cuestionario pasa de 8 a 6 pasos y todo se elige, sin escribir.
- **Selectores** (`src/components/Picker.tsx`): edad, altura, peso (kilos y decimales en dos columnas) y país
  (`src/lib/countries.ts`) se eligen en una lista que sale desde abajo. Al cambiar de unidades, la altura y el peso
  elegidos se convierten (`convertDraftUnits`). También en Perfil.
- **Fuera del cuestionario** (siguen en Perfil o en Cuerpo): el nombre (ahora opcional; Inicio dice «Hola» sin
  él), la fecha objetivo, los grupos débiles, el paso de medidas entero, las horas de sueño, el estrés, las comidas
  al día y los textos de alimentación (otras alergias, alimentos que no comes o favoritos, presupuesto,
  suplementos). Nada de eso entraba en los cálculos salvo las medidas, que se piden en «Cuerpo».
- **Pasos al día** por tramos (menos de 5.000, de 5.000 a 8.000…, «No lo sé»), alineados con los umbrales del
  cálculo de calorías.
- **Comprobado:** `npm run check` (129 pruebas, 5 nuevas del cuestionario corto y del cambio de unidades) y
  `expo export` para web y Android. **Por probar en el móvil:** que la lista se abra en el valor elegido y se
  pueda desplazar bien.

## Segunda revisión de seguridad: datos y archivos (11/11/2026)

Detalle en `../SEGURIDAD.md`. Fotos: las copias temporales de la caché se borran al terminar y con «Borrar todos mis
datos» (`src/lib/temp-files.ts`); las fotos de comidas se buscan por nombre en la carpeta actual (en iOS la ruta
cambia al actualizar la app) y solo se borran archivos con nombres de la app; «Borrar todos mis datos» borra primero
la base de datos. Servidor: los registros ya no guardan la búsqueda ni el código de barras, y notas y nombres llevan
tope. Docker: Caddy sin capacidades de más.
- **Comprobado:** `npm run check` (124 pruebas), `expo export` para Android y web, servidor con 39 pruebas (2
  nuevas). La consulta de «foto en uso» con rutas de iOS antiguas y nuevas, probada aparte con SQLite.
- **Por probar en el móvil:** hacer y borrar fotos de progreso y de comidas, y «Borrar todos mis datos». En el VPS:
  que Caddy arranque con las capacidades recortadas.

## VPS, seguridad y versión web (10/11/2026)

Para probar la app durante un mes desde el navegador antes del App Store. Guía en `../DESPLIEGUE.md`; revisión de
seguridad completa en `../SEGURIDAD.md`.

- **Despliegue:** `docker-compose.yml` con Caddy (HTTPS automático, la web y `/api` → servidor) y el servidor sin
  puertos públicos. La web se compila con `EXPO_PUBLIC_API_URL=/api` (mismo dominio).
- **Acceso:** fuera `APP_TOKEN`/`EXPO_PUBLIC_APP_TOKEN` (iba dentro de la app). Ahora cada persona tiene un código
  (`ACCESS_CODES`) que escribe en **Más → Servidor y código de acceso** (`servidor.tsx`); se guarda en el llavero
  (`expo-secure-store`, nueva dependencia de Expo Go) o en el navegador. Cupos diarios y análisis a la vez limitados.
- **Web:** los diálogos de confirmación ya funcionan (`appAlert`: generar rutina, evaluar bloque, descartar o borrar
  sesiones, pesadas, medidas…); «Exportar mis datos» descarga el JSON; se pide almacenamiento persistente; aviso en
  «Más» para exportar y, en el iPhone, añadirla a la pantalla de inicio; las fotos de progreso dicen que son solo
  del móvil; manifiesto, iconos y `noindex`.
- **Comprobado:** `npm run check` (124 pruebas), `expo export` para Android y web, servidor con 37 pruebas (8
  nuevas: códigos, cupos, análisis a la vez, proxy, CORS, formato de imagen). En el navegador, con la web compilada
  como en el VPS, el servidor en modo producción y un proxy local con las mismas cabeceras que Caddy (CSP, COOP,
  COEP): SQLite arranca (`crossOriginIsolated`), sin avisos de CSP; código falso rechazado y bueno aceptado («0 de
  40»); sin código, el error ofrece «Poner el código»; código de barras de Nutella hasta «Revisar comida»;
  cuestionario completo; la confirmación de «Generar una rutina nueva» aparece; la exportación da un JSON válido.
- **Sin probar:** Docker y Caddy de verdad (no había Docker en el PC), el VPS, el análisis real con IA (sin clave
  de Anthropic), Safari en el iPhone, y el código de acceso en el móvil con Expo Go.
- **Pendiente:** importar una exportación (para pasar los datos de la web a la app del App Store); icono propio y
  `ios.bundleIdentifier`; consentimiento explícito antes del primer análisis con IA (lo pide Apple).

## Fusión con SnapCal

| Fase | Contenido | Estado |
| --- | --- | --- |
| 1 | Plan y decisiones (`../fusion/PLAN-FUSION.md`) | Hecha |
| 2 | Base: tema claro/oscuro, sistema de traducciones, preferencias de tema e idioma (en «Más») | Hecha |
| 3 | Migración 2 y capa de datos de nutrición (comidas con alimentos, favoritas, agua, pasos, ajustes, dieta) | Hecha |
| 4 | Servidor (`../server/`) y cliente de la API (`src/lib/api.ts`, `api-config.ts`, `photo-prep.ts`) | Hecha |
| 5 | Pantallas de comida (`src/app/comida/`): foto, texto, código de barras, favoritas, revisar y corregir | Hecha |
| 6-10 | Inicio y Nutrición, cuestionario único, conexiones, agua y pasos, traducción | Pendientes (la 6, empezada) |

**Cambios tras verla en el móvil (17/10/2026):** por primera vez en un móvil real (Expo Go con `npx expo start
--tunnel`, con sesión de Expo iniciada en Ubuntu). A petición de Miquel:
- **Fondo blanco y más elegante:** el tema claro es ahora el de por defecto, con una paleta nueva (fondo blanco,
  tarjetas en gris cálido, acento verde bosque `#1d6b45` en lugar del lima, títulos algo mayores y esquinas más
  redondeadas). Contraste comprobado: textos de 5:1 en adelante y gráficos de 3:1. El oscuro sigue en «Más». La
  pantalla de arranque pasa a verde bosque (el icono es blanco).
- **Cuestionario más corto (8 pasos en vez de 10):** fuera las marcas aproximadas, las rutinas anteriores, los
  ejercicios favoritos y a evitar, las lesiones y molestias y las limitaciones de movilidad. Se completan en Perfil,
  donde «Lesiones, molestias y limitaciones» sube justo debajo de los datos; el resumen final avisa de añadir ahí
  cualquier lesión antes de entrenar y generar la rutina de nuevo.
- Textos de privacidad de la bienvenida y del perfil al día (ya hay servidor para analizar comidas).
- Comprobado: `npm run check` (122 pruebas) y en la vista web (fondo blanco y «Paso 1 de 8»). En el móvil, el
  cambio de tema se ve al momento; el cuestionario nuevo, solo al empezar de cero.

**Fase 5, comprobado (17/10/2026):** `npm run check` con tipos, lint y **122 pruebas** (18 nuevas: 12 del borrador de
comida y 6 de guardar con favoritas, corregir y deshacer si algo falla). `expo export` para Android compila y
`expo-doctor` 21/21; el micrófono queda fuera del manifiesto. En la vista web, con el servidor de verdad y un perfil
de prueba con alergia al gluten: código de barras de Nutella → revisar → 15 g recalcula a 81 kcal y el margen →
guardar con estrella → aparece en Nutrición y en Favoritas; «+» la vuelve a añadir; una comida a mano (manzana)
se guarda, se corrige a 300 g sin cambiar la hora y se borra con la confirmación; un código que no existe da su
aviso con «Escribirla» y «Añadirla a mano»; el texto sin clave de Anthropic explica qué falta, y la petición lleva
el idioma y la alergia (`avoid: ["Gluten"]`).

**Fase 5, sin probar:** todo en un móvil real (cámara, lectura de códigos, galería, guardar la foto con la comida y
borrarla); el análisis real de fotos y textos y los avisos de alergias (sin clave de Anthropic); la preparación de
la foto en la web (en la prueba el panel del navegador estaba oculto y el navegador no decodifica imágenes así; se
corrigió un fallo de `expo-image-manipulator` en web leyendo su código, ver decisiones).

**Decisiones de la fase 5:**
- Foto con la cámara del sistema (`expo-image-picker`), como las fotos de progreso, en vez del visor propio de
  SnapCal. `expo-camera` solo se usa para leer códigos de barras, y solo en el móvil; en la web se escribe el número
  (también se puede en el móvil). `comida/foto?abrir=camara` abre la cámara al entrar (para el botón grande de Inicio).
- Todo pasa por la pantalla de revisión (`comida/nueva`), que es la misma que corrige una comida guardada
  (`comida/[id]`): nombre, gramos de cada alimento (recalcula desde los valores de partida), quitar y añadir
  alimentos a mano, día, «guardar también en favoritas» y avisos. Guardar vuelve a la pestaña desde la que se empezó.
- Las alergias y alimentos excluidos del perfil ya se mandan al servidor y la revisión muestra «Podría contener…».
  La fase 8 añade la búsqueda por palabras clave en la app.
- Borrar una comida pide confirmación dentro de la pantalla (no con `Alert`, que no funciona en la web).
- «Recientes» repite una comida como `favorita`; «+» la añade a hoy y se queda en la pantalla para añadir varias.
- En la web no se guarda la foto de la comida (no hay carpeta de la app).
- `resize` con `null` en el otro lado rompe el redimensionado en la web: ahora se indica solo un lado (también en
  las fotos de progreso).
- Textos de privacidad corregidos: la bienvenida y los permisos de cámara y fotos ya dicen que las comidas que
  analizas van a tu servidor.

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
