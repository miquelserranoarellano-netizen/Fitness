# Despliegue en un VPS de IONOS

Guía para poner la app en internet durante la prueba (web) y dejar el servidor listo para la versión del
App Store. Se hace una vez; después, actualizar es un comando.

```
Navegador / móvil ──HTTPS 443──► Caddy (certificado, web, cabeceras de seguridad)
                                    └── /api ──► servidor Node (solo red interna de Docker) ──► Anthropic, USDA, Open Food Facts
```

- **Los datos de cada persona no van al VPS**: entrenamientos, medidas y comidas se guardan en su navegador (o en
  su teléfono con la app). El servidor solo analiza comidas y no guarda nada; en el VPS solo hay registros y el
  certificado de HTTPS.
- **HTTPS es obligatorio**, no un extra: sin él la web no arranca (SQLite en el navegador necesita una conexión
  segura y aislamiento entre orígenes) y el navegador no deja usar la cámara.

## 0. Qué necesitas

| Qué | Para qué |
| --- | --- |
| VPS Linux de IONOS con **Ubuntu 24.04** y **2 GB de RAM o más** | Con 1 GB funciona, pero compilar la web es lento (el script añade memoria de intercambio) |
| Un **dominio** o subdominio, p. ej. `fitness.tudominio.com` | El certificado de HTTPS va asociado a un nombre |
| Clave de **Anthropic** con un **límite de gasto mensual** puesto en la consola | Análisis de fotos y textos |
| Clave gratuita de **USDA** ([alta](https://fdc.nal.usda.gov/api-key-signup)) | Cifras de alimentos genéricos |
| Acceso al repositorio de GitHub (es privado) | Descargar el código en el VPS |

## 1. VPS, cortafuegos y dominio (panel de IONOS)

1. Crea el VPS con **Ubuntu 24.04**. Apunta su **IP** y la contraseña de `root`.
2. **Cortafuegos de IONOS** (Red → Políticas de firewall, la del VPS): permite **TCP 22, 80 y 443** (y UDP 443,
   opcional, para HTTP/3). Si el 80 o el 443 están cerrados, no se puede emitir el certificado.
3. **DNS** (Dominios → tu dominio → DNS): añade un registro **A** con nombre `fitness` y valor la IP del VPS. Si el
   VPS tiene IPv6, un registro **AAAA** también. Comprueba desde tu PC que ya apunta:

   ```bash
   nslookup fitness.tudominio.com
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

Si te quedas fuera, IONOS tiene una consola web (KVM) en el panel del VPS para entrar sin SSH.

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

Edita `.env` (`nano .env`) y rellena `DOMAIN`, `ACME_EMAIL`, `ANTHROPIC_API_KEY`, `USDA_API_KEY` y
`ACCESS_CODES` con las líneas de antes separadas por comas (`miquel:…,marc:…`). A cada persona pásale **solo su
código** (lo de después de `:`), por un canal privado.

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
curl https://fitness.tudominio.com/api/health
```

## 7. Probar desde el móvil

1. Abre `https://fitness.tudominio.com`, haz el cuestionario y entra en **Más → Servidor y código de acceso**: pega
   tu código y pulsa «Guardar y comprobar». Debe decir «Código de miquel · Hoy llevas 0 de 40 análisis».
2. **iPhone: añádela a la pantalla de inicio** (Safari → Compartir → «Añadir a pantalla de inicio») y úsala desde
   ese icono. Si se usa solo como pestaña de Safari, Safari puede borrar sus datos tras 7 días sin abrirla.
   Android: Chrome → menú → «Instalar aplicación».
3. **Copia de seguridad**: Perfil → Tus datos → Exportar mis datos, de vez en cuando. Los datos viven solo en ese
   navegador.

En la web no hay lector de códigos con cámara (se escribe el número), ni fotos de progreso, ni se guarda la foto de
cada comida: eso queda para la app del móvil.

## Día a día

| Qué | Comando (en `/opt/fitness`) |
| --- | --- |
| Actualizar a lo último de `main` | `bash deploy/update.sh` |
| Ver qué pasa | `docker compose logs --tail=100 api` |
| Uso por persona (sin contenido) | `docker compose logs --no-log-prefix api \| grep '\[uso\]'` |
| Intentos con código malo | `docker compose logs --no-log-prefix api \| grep '\[acceso\]'` |
| Añadir o retirar a alguien | Edita `ACCESS_CODES` en `.env` y `docker compose up -d` |
| Reiniciar / parar | `docker compose restart` / `docker compose down` |

El gasto tiene tres techos: el límite mensual de la consola de Anthropic, `DAILY_LIMIT_PER_PERSON` y
`DAILY_LIMIT_TOTAL` (en `.env`). Los cupos diarios viven en memoria: se reinician a medianoche (hora de Madrid) y
al reiniciar el servidor.

## Si algo falla

| Síntoma | Causa probable |
| --- | --- |
| No hay certificado (`docker compose logs web` habla de ACME) | El DNS aún no apunta al VPS, o el 80/443 está cerrado en el cortafuegos de IONOS |
| `api` no arranca: «hace falta ACCESS_CODES» o «no es válido» | Falta `ACCESS_CODES` en `.env`, o un código tiene menos de 16 caracteres |
| La web sale en blanco o con un error de SQLite | Se ha abierto por `http://` o por la IP, no por `https://` y el dominio |
| La app dice «Falta tu código de acceso» | Código mal copiado (sin espacios) o retirado de `ACCESS_CODES` |
| La compilación se corta por memoria | VPS de 1 GB sin intercambio: vuelve a ejecutar `deploy/setup-vps.sh` |

## Después: la app en el App Store

El servidor ya sirve tal cual para la app nativa. Lo que falta, por orden:

1. **Apple Developer Program** (99 € al año) y una cuenta de Expo.
2. En `app/app.json`: `ios.bundleIdentifier` (p. ej. `com.tunombre.fitnesscoach`) y un **icono propio** (el actual
   es el de ejemplo de Expo).
3. Compilar con EAS (`npx eas-cli build -p ios`) poniendo `EXPO_PUBLIC_API_URL=https://fitness.tudominio.com/api`
   en `eas.json`. Con un dominio fijo no hace falta tocar nada más.
4. **TestFlight** con las mismas personas de la prueba antes de enviarla a revisión.
5. Para la revisión de Apple: **política de privacidad** publicada (puede ir en el mismo dominio), la ficha de
   privacidad (las fotos y textos de comida van a tu servidor y a Anthropic; nada de seguimiento), un **código de
   acceso de demostración** en las notas para el revisor y avisos de salud. Apple pide además consentimiento
   explícito antes de enviar datos personales a una IA de terceros: conviene una pantalla de permiso antes del
   primer análisis.
6. Los códigos de acceso sirven para la prueba, no para una app pública: para el lanzamiento hay que decidir cómo
   se paga la IA (suscripción, cupo gratuito por dispositivo con App Attest…).
