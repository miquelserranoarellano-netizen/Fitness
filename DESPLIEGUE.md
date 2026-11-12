# Despliegue en un VPS de Hostinger

Guía para poner IKYNDO en internet durante la prueba (portada y app web) y dejar el servidor listo para la versión
del App Store. Se hace una vez; después, actualizar es un comando.

```
Navegador / móvil ──HTTPS 443──► Caddy (certificados, cabeceras de seguridad)
                                    ├── tudominio.com ──────► portada de IKYNDO (deploy/landing/: HTML y CSS)
                                    └── app.tudominio.com ──► la app web
                                          └── /api ──► servidor Node (solo red interna de Docker) ──► Open Food Facts, USDA
```

**Sin IA:** la app va con la IA apagada (`app/src/lib/features.ts`) y el servidor sin clave de Anthropic, así que no
se gasta ni un token: las comidas se añaden por código de barras, desde favoritas o a mano. Para encenderla más
adelante hacen falta las dos cosas: `EXPO_PUBLIC_AI=on` en `deploy/web.Dockerfile` y `ANTHROPIC_API_KEY` en `.env`.

«Entrar en la app» en la portada lleva a `tudominio.com/app`, que Caddy redirige a `app.tudominio.com`. La app va en
su propio subdominio para no tocar la compilación de Expo y para que la portada no comparta origen con los datos.

- **Los datos de cada persona no van al VPS**: entrenamientos, medidas y comidas se guardan en su navegador (o en
  su teléfono con la app). El servidor solo analiza comidas y no guarda nada; en el VPS solo hay registros y el
  certificado de HTTPS.
- **HTTPS es obligatorio**, no un extra: sin él la web no arranca (SQLite en el navegador necesita una conexión
  segura y aislamiento entre orígenes) y el navegador no deja usar la cámara.

## Qué contratar en Hostinger

| En el carrito | Qué elegir |
| --- | --- |
| Plan | **KVM 1** (1 vCPU, 4 GB de RAM, 50 GB de disco). Sobra: la portada, la app y el servidor usan menos de 1 GB; los 4 GB son para compilar la web en el propio VPS |
| Periodo | **1 mes** para la prueba (luego se puede alargar). Ojo con la renovación automática al precio normal (paso 8) |
| Centro de datos | Uno en **Europa**, el más cercano a España que ofrezca |
| Sistema operativo | **Ubuntu 24.04** a secas, sin panel ni aplicaciones |
| Copia de seguridad diaria | **No**: en el VPS no hay datos de nadie que guardar |
| Dominio | Si el plan no lo trae gratis, compra uno (`.com` o `.es`) en Hostinger o donde quieras |

No hace falta un plan de *hosting web* (los compartidos no ejecutan Docker): tiene que ser un **VPS**.

## Subirlo desde el PC (camino corto)

`deploy/subir.ps1` lo hace todo desde Windows por SSH, sin GitHub en el VPS: copia lo último confirmado, prepara el
VPS la primera vez (`deploy/setup-vps.sh`, SSH solo con clave), crea el `.env` con un código de acceso por persona
y sin IA, y arranca la portada, la app y el servidor. Para actualizar, se vuelve a ejecutar (el `.env` se conserva).

1. **Clave SSH en el PC:** `C:\Users\<tú>\.ssh\ikyndo_vps` (si no existe:
   `ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\ikyndo_vps -N '""'`).
2. **Al crear el VPS en hPanel** (KVM 1, Ubuntu 24.04), en «Clave SSH» pega el contenido de `ikyndo_vps.pub` (una
   línea que empieza por `ssh-ed25519`). Apunta la **IP**.
3. **DNS:** registros **A** de `@` y de `app` con esa IP (paso 1.3).
4. **En la raíz del repositorio**, en PowerShell:

   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\subir.ps1 -Ip IP_DEL_VPS -Dominio tudominio.com -Correo tu@correo.com -Personas "miquel,marc"
   ```

5. **Los códigos de acceso** (uno por persona; pásale a cada una solo el suyo):

   ```powershell
   ssh -i $env:USERPROFILE\.ssh\ikyndo_vps root@IP_DEL_VPS "grep ACCESS_CODES /opt/fitness/.env"
   ```

Después, el paso 7 (probar desde el móvil). Los pasos 1 a 6 de abajo son el camino a mano, con `git clone`.

## 0. Qué necesitas

| Qué | Para qué |
| --- | --- |
| VPS de Hostinger **KVM 1** (1 vCPU, 4 GB de RAM) con **Ubuntu 24.04** | Sobra para la prueba: hacen falta 2 GB de RAM para compilar la web con soltura; con 1 GB funciona, pero lento (el script añade memoria de intercambio) |
| Un **dominio** propio, p. ej. `tudominio.com` | La portada va en el dominio y la app en `app.tudominio.com`: los certificados de HTTPS van asociados a esos nombres |
| Clave gratuita de **USDA** ([alta](https://fdc.nal.usda.gov/api-key-signup)) | Cifras de alimentos genéricos |
| Acceso al repositorio de GitHub (es privado) | Descargar el código en el VPS |

## 1. VPS, cortafuegos y dominio (hPanel de Hostinger)

1. En **hPanel → VPS**, elige como sistema operativo **Ubuntu 24.04** a secas (sin panel de control ni aplicaciones:
   Docker lo instala el paso 4). Pon una contraseña de `root` y apunta la **IP** del VPS.
2. **Cortafuegos de Hostinger** (en la página del VPS, apartado de seguridad): si lo activas, permite **TCP 22, 80 y
   443** (y UDP 443, opcional, para HTTP/3). Si no lo activas, el paso 4 deja el del propio VPS (`ufw`) con solo
   esos puertos. Si el 80 o el 443 están cerrados, no se pueden emitir los certificados.
3. **DNS** (hPanel → Dominios → tu dominio → DNS): pon la IP del VPS en el registro **A** de `@` (Hostinger lo trae
   apuntando a su página de aparcamiento: cámbialo, no añadas otro) y añade otro registro **A** con nombre `app` y la
   misma IP. Deja el `www` que suele traer (un CNAME al dominio): la portada lo redirige. Si el VPS tiene IPv6,
   registros **AAAA** también. Si el dominio no es de Hostinger, haz lo mismo en el DNS de donde lo tengas.
   Comprueba desde tu PC que los dos ya apuntan:

   ```bash
   nslookup tudominio.com
   ```

   ```bash
   nslookup app.tudominio.com
   ```

## 2. Entrar por SSH con clave y cerrar la contraseña

Desde PowerShell en tu PC:

```bash
ssh-keygen -t ed25519
```

```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@IP_DEL_VPS "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Abre **otra** ventana y comprueba que `ssh root@IP_DEL_VPS` entra sin pedir contraseña. Solo entonces, dentro del
VPS, desactiva las contraseñas (el `01-` del nombre importa: en Ubuntu manda el primer valor que se lee):

```bash
printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/01-endurecido.conf && sshd -t && systemctl reload ssh
```

Si te quedas fuera, hPanel tiene una terminal en el navegador en la página del VPS para entrar sin SSH.

## 3. Descargar el código (clave de solo lectura)

En el VPS:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/fitness_deploy -N "" && cat ~/.ssh/fitness_deploy.pub
```

En GitHub: repositorio **Fitness → Settings → Deploy keys → Add deploy key**, pega esa línea y deja **sin marcar**
«Allow write access». Después, en el VPS:

```bash
printf 'Host github-fitness\n  HostName github.com\n  User git\n  IdentityFile ~/.ssh/fitness_deploy\n' >> ~/.ssh/config
```

```bash
git clone git@github-fitness:miquelserranoarellano-netizen/Fitness.git /opt/fitness && cd /opt/fitness
```

## 4. Preparar el servidor

Instala Docker, activa el cortafuegos (solo 22, 80 y 443), fail2ban para SSH, las actualizaciones de seguridad
automáticas y memoria de intercambio si hace falta:

```bash
bash deploy/setup-vps.sh
```

Docker publica sus puertos por su cuenta, sin pasar por `ufw`: por eso el servidor de la app no publica ninguno y
solo Caddy (80 y 443) está abierto.

## 5. Configurar

```bash
cp .env.example .env && chmod 600 .env
```

Genera un código de acceso por persona (cada uno sale distinto):

```bash
echo "miquel:$(openssl rand -base64 18 | tr '+/' '-_')"
```

```bash
echo "marc:$(openssl rand -base64 18 | tr '+/' '-_')"
```

Edita `.env` (`nano .env`) y rellena `DOMAIN` (el dominio a secas, `tudominio.com`), `ACME_EMAIL`, `USDA_API_KEY`
(opcional) y `ACCESS_CODES` con las líneas de antes separadas por comas (`miquel:…,marc:…`). **`ANTHROPIC_API_KEY`
se queda vacía** (sin IA, sin gasto). A cada persona pásale **solo su código** (lo de después de `:`), por un canal
privado: sirve para buscar productos por su código de barras.

## 6. Arrancar

La primera vez tarda unos minutos (compila la web):

```bash
docker compose up -d --build
```

```bash
docker compose ps
```

Comprueba desde tu PC que responde con `"auth":true`:

```bash
curl https://app.tudominio.com/api/health
```

## 7. Probar desde el móvil

1. Abre `https://tudominio.com`: sale la portada. Pulsa **«Entrar en la app»** (lleva a `https://app.tudominio.com`),
   haz el cuestionario y entra en **Más → Servidor y código de acceso**: pega tu código y pulsa «Guardar y
   comprobar». Debe decir «Código de miquel».
2. **iPhone: añade la app a la pantalla de inicio** desde la app (`app.tudominio.com`), no desde la portada
   (Safari → Compartir → «Añadir a pantalla de inicio»), y úsala desde ese icono. Si se usa solo como pestaña de
   Safari, Safari puede borrar sus datos tras 7 días sin abrirla. Android: Chrome → menú → «Instalar aplicación».
3. **Copia de seguridad**: Perfil → Tus datos → Exportar mis datos, de vez en cuando. Los datos viven solo en ese
   navegador.

En la web no hay lector de códigos con cámara (se escribe el número), ni fotos de progreso, ni se guarda la foto de
cada comida: eso queda para la app del móvil.

**Qué probar el primer día** (en el móvil, desde el icono de la pantalla de inicio):

- [ ] La portada abre con candado (HTTPS) y «Entrar en la app» lleva a la app.
- [ ] Cuestionario completo → informe inicial → Inicio con la rutina de hoy.
- [ ] Empezar el entrenamiento, apuntar 2 o 3 series y terminarlo.
- [ ] Más → Servidor y código de acceso: pegar el código y ver «Código de …».
- [ ] Nutrición → Añadir comida: una por código de barras (escribiendo el número) y otra a mano. No aparece nada
      de IA (ni cámara ni «Escribir»).
- [ ] Más → Apariencia e idioma: tema oscuro e inglés, y vuelta a español.
- [ ] Perfil → Tus datos → Exportar: se descarga el archivo JSON.
- [ ] Cerrar el navegador, volver a abrir el icono y comprobar que todo sigue ahí.

Si algo falla, `docker compose logs --tail=100 api` (servidor) y `docker compose logs --tail=100 web` (Caddy).

## 8. Si solo es un mes

- Quita la **renovación automática** en hPanel (Facturación) si no vas a seguir: si no, se renueva al precio normal.
- Antes de apagar el VPS, pide a cada persona que **exporte sus datos** (Perfil → Tus datos): viven en su navegador
  y, sin la web, no podrían abrirlos. Con esa copia los recuperan en otra web o en la app del móvil.
- Guarda una copia de `.env` en tu PC (tiene los códigos de acceso). En el VPS no hay nada más que conservar: ni
  la «copia de seguridad diaria» de Hostinger hace falta.

## Día a día

| Qué | Comando (en `/opt/fitness`) |
| --- | --- |
| Actualizar (instalado desde el PC) | En el PC: `deploy\subir.ps1` con los mismos datos |
| Actualizar (instalado con `git clone`) | `bash deploy/update.sh` |
| Ver qué pasa | `docker compose logs --tail=100 api` |
| Uso por persona (sin contenido) | `docker compose logs --no-log-prefix api \| grep '\[uso\]'` |
| Intentos con código malo | `docker compose logs --no-log-prefix api \| grep '\[acceso\]'` |
| Añadir o retirar a alguien | Edita `ACCESS_CODES` en `.env` y `docker compose up -d` |
| Reiniciar / parar | `docker compose restart` / `docker compose down` |

Sin IA no hay gasto. Si un día se enciende, el gasto tiene tres techos: el límite mensual de la consola de
Anthropic, `DAILY_LIMIT_PER_PERSON` y `DAILY_LIMIT_TOTAL` (en `.env`). Los cupos diarios viven en memoria: se
reinician a medianoche (hora de Madrid) y al reiniciar el servidor.

## Si algo falla

| Síntoma | Causa probable |
| --- | --- |
| No hay certificado (`docker compose logs web` habla de ACME) | El DNS aún no apunta al VPS, o el 80/443 está cerrado en el cortafuegos de Hostinger |
| La portada abre pero «Entrar en la app» da error | Falta el registro **A** de `app` en el DNS (o aún no se ha propagado) |
| `api` no arranca: «hace falta ACCESS_CODES» o «no es válido» | Falta `ACCESS_CODES` en `.env`, o un código tiene menos de 16 caracteres |
| La web sale en blanco o con un error de SQLite | Se ha abierto por `http://` o por la IP, no por `https://` y el dominio |
| La app dice «Falta tu código de acceso» | Código mal copiado (sin espacios) o retirado de `ACCESS_CODES` |
| La compilación se corta por memoria | VPS de 1 GB sin intercambio: vuelve a ejecutar `deploy/setup-vps.sh` |

## Después: la app en el App Store

El servidor ya sirve tal cual para la app nativa. Lo que falta, por orden:

1. **Apple Developer Program** (99 € al año) y una cuenta de Expo.
2. En `app/app.json`: `ios.bundleIdentifier` (p. ej. `com.tunombre.fitnesscoach`) y un **icono propio** (el actual
   es el de ejemplo de Expo).
3. Compilar con EAS (`npx eas-cli build -p ios`) poniendo `EXPO_PUBLIC_API_URL=https://app.tudominio.com/api`
   en `eas.json`. Con un dominio fijo no hace falta tocar nada más.
4. **TestFlight** con las mismas personas de la prueba antes de enviarla a revisión.
5. Para la revisión de Apple: **política de privacidad** publicada (puede ir junto a la portada), la ficha de
   privacidad (las fotos y textos de comida van a tu servidor y a Anthropic; nada de seguimiento), un **código de
   acceso de demostración** en las notas para el revisor y avisos de salud. Apple pide además consentimiento
   explícito antes de enviar datos personales a una IA de terceros: conviene una pantalla de permiso antes del
   primer análisis.
6. Los códigos de acceso sirven para la prueba, no para una app pública: para el lanzamiento hay que decidir cómo
   se paga la IA (suscripción, cupo gratuito por dispositivo con App Attest…).
