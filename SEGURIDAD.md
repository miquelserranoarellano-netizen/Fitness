# Revisión de seguridad

Revisión del 10 de noviembre de 2026, antes de poner la app en un VPS para la prueba de un mes. Cubre el servidor
(`server/`), el cliente de la API y el almacenamiento en la app (`app/src/lib/`), las dependencias y el despliegue.

## Encontrado y corregido

| Gravedad | Problema | Arreglo |
| --- | --- | --- |
| Alta | **El token iba dentro de la app.** `EXPO_PUBLIC_APP_TOKEN` se incrusta en el código: en la web lo lee cualquiera en el JavaScript y en una app publicada se extrae del paquete. Con el servidor en internet, cualquiera podía gastar el saldo de Anthropic. | Códigos de acceso **por persona** (`ACCESS_CODES`) que cada uno escribe en la app (Más → Servidor). Se guardan en el llavero del teléfono (expo-secure-store) o en el navegador, viajan en `Authorization: Bearer` y se comparan resumidos y sin filtrar tiempos. En producción el servidor **no arranca sin códigos**. `APP_TOKEN` queda retirado. |
| Alta | **Sin techo de gasto.** Solo había 20 peticiones por minuto y IP (hasta ~28.800 análisis al día por IP, cada uno de hasta 16.000 tokens). | Cupo diario por persona y total (`DAILY_LIMIT_PER_PERSON`, `DAILY_LIMIT_TOTAL`) y un máximo de análisis a la vez (`MAX_CONCURRENT_ANALYSES`). Lo que no tiene cupo no llega a la IA. Además: límite mensual en la consola de Anthropic (DESPLIEGUE.md). |
| Alta | **Detrás de un proxy el límite por IP no funcionaba.** Express veía la IP del proxy para todos: todos compartían el mismo límite (uno podía bloquear al resto). | `TRUST_PROXY` (1 en el VPS, detrás de Caddy, que no se fía de un `X-Forwarded-For` enviado por el cliente). |
| Alta | **Dependencia vulnerable** en el servidor: `body-parser` con denegación de servicio (GHSA-27r3-jxmh-p828). | `npm audit fix`: el servidor queda con 0 avisos. |
| Media | **Cuerpos de 8 MB en cualquier ruta.** El lector de JSON se aplicaba a todo el servidor, también a rutas sin límite ni token (`POST /loquesea`): una forma barata de cargarlo. | Cada ruta lee solo lo que necesita y después de comprobar el código: foto 8 MB, texto 32 KB, el resto nada. |
| Media | **CORS abierto a cualquier web** (`cors()`): con el servidor en internet, cualquier página podía usarlo desde el navegador de sus visitantes. | En producción ningún origen externo (la web y el servidor comparten dominio) o la lista `ALLOWED_ORIGINS`. Las apps nativas no usan CORS. |
| Media | **HTTP sin cifrar y sin cabeceras de seguridad**: el servidor escuchaba en claro en el puerto 3000. | Caddy con HTTPS automático, HSTS, CSP estricta (solo código del propio dominio), COOP/COEP, `X-Frame-Options`, `noindex`. El servidor no se publica fuera de Docker y corre sin root, con sistema de archivos de solo lectura y sin capacidades. Respuestas de la API con `Cache-Control: no-store`. |
| Baja | El formato de la imagen se aceptaba según lo que decía la petición. | Se comprueba por los primeros bytes (JPEG, PNG o WebP); lo demás no llega a la IA. |
| Baja | La lista de alergias entra en las instrucciones de la IA con saltos de línea y caracteres de control (inyección de instrucciones; solo afecta a la propia respuesta, que va con esquema fijo). | Se limpian antes de usarla. |
| Baja | 16 avisos de `npm audit` en la app. | 9 corregidos sin cambiar versiones mayores. Ver «Riesgos aceptados». |
| Info | No se sabía quién usaba el servidor. | Registros `[uso]` (persona, ruta, resultado, tiempo) y `[acceso]` (códigos fallidos), nunca el contenido. |

### Segunda revisión (11 de noviembre de 2026)

| Gravedad | Problema | Arreglo |
| --- | --- | --- |
| Media | Se podían probar códigos de acceso sin freno (solo el límite general por minuto). | Tras 10 códigos incorrectos, esa dirección queda bloqueada 10 minutos (`auth_blocked`); los aciertos no cuentan. |
| Media | Una sola persona podía ocupar todos los análisis a la vez; si cancelaba, la petición a la IA seguía (y se pagaba). | Máximo de 2 análisis a la vez por persona; al cancelar se corta la petición a Anthropic. Los fallos en los que la IA no llega a trabajar devuelven el análisis al cupo. |
| Media | Peticiones lentas a propósito podían ocupar conexiones del servidor y de Caddy. | Tiempos máximos para cabeceras y cuerpo en Node y en Caddy; Caddy sin interfaz de administración, sin root y sin capacidades salvo abrir los puertos 80/443. |
| Media | La app mandaba el código y las fotos a cualquier dirección configurada, también por HTTP sin cifrar. | Sin HTTPS solo se conecta a la red local; a internet, nunca en claro (`insecure_server`). |
| Media | Antes del primer análisis no se pedía permiso para enviar la comida a una IA externa (lo exige Apple). | Pantalla de permiso que explica qué sale y a quién (servidor y Anthropic); se retira en Más → Servidor. |
| Baja | Un `language` que no era texto (`?language[x]=…`) tumbaba la petición con un 500. | Solo se aceptan cadenas; prueba con entradas raras (`__proto__`, tipos cambiados, códigos de barras con `../`). |
| Baja | Los textos de la IA y de las bases de datos llegaban sin tope a la app y a la base de datos. | Acotados en el servidor y otra vez en la app (textos cortos, cifras entre 0 y un máximo, como mucho 40 alimentos). |
| Baja | La web enseñaba la lista de todas sus pantallas (`/_sitemap`) y una página de error en inglés. | Lista desactivada y página propia de «no encontrada». |
| Baja | El importador de copias es una entrada no fiable. | Validación con Zod, nombres de tablas y columnas solo del esquema, valores siempre como parámetros, rutas de fotos descartadas y todo en una transacción. |

Ya estaba bien hecho: la clave de Anthropic solo vive en el servidor; las respuestas se validan con Zod en los dos
lados; los errores no enseñan detalles internos; las fotos se reducen y pierden los metadatos (ubicación incluida)
antes de enviarse; los datos personales se quedan en el dispositivo.

## Riesgos aceptados y pendientes

- **7 avisos de dependencias en la app** que solo se van con Expo SDK 58: herramientas de compilación de Expo (no
  van dentro de la app) y `decode-uri-component` dentro de `expo-router` (una URL mal formada puede colgar la
  pestaña de quien la abre; no afecta al servidor ni a otros usuarios). Revisar al actualizar el SDK.
- **Los datos de la web viven en el navegador**: si Safari los borra (7 días sin abrir una web que no está en la
  pantalla de inicio) o se limpia el navegador, se pierden. Mitigado con el aviso en «Más», la petición de
  almacenamiento persistente y la exportación; no hay copia en el servidor (decisión de privacidad).
- **Los cupos diarios viven en memoria**: un reinicio los pone a cero. Para la prueba basta; el techo final es el
  límite mensual de la consola de Anthropic.
- **Los códigos de acceso son para la prueba**: para el App Store hará falta otro modelo (DESPLIEGUE.md, último
  apartado).
- **Sin probar en un VPS real**: Docker y Caddy no estaban disponibles donde se preparó esto. Se probó lo mismo con
  un proxy local con las mismas cabeceras (ver `app/docs/ESTADO.md`).
