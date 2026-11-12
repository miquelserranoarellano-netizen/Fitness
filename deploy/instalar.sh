#!/usr/bin/env bash
# Instala o actualiza IKYNDO en el VPS con el código ya copiado en /opt/fitness (lo copia deploy/subir.ps1 desde el
# PC). La primera vez prepara el VPS (setup-vps.sh), deja SSH solo con clave y crea el .env con un código de acceso
# por persona; las siguientes solo vuelve a construir y arrancar. Como root:
#   bash /opt/fitness/deploy/instalar.sh <dominio> <correo> [personas separadas por comas]
set -euo pipefail
cd "$(dirname "$0")/.."

dominio="${1:-}"
correo="${2:-}"
personas="${3:-miquel}"
if [ "$(id -u)" -ne 0 ]; then
  echo "Ejecútalo como root." >&2
  exit 1
fi
# Las expresiones van en variables: escritas dentro de [[ ]], bash trataría | y & como órdenes.
re_dominio='^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
re_correo='^[^[:space:]@|&\\]+@[^[:space:]@|&\\]+\.[^[:space:]@|&\\]+$'
re_personas='^[a-z0-9_.-]+(,[a-z0-9_.-]+)*$'
if ! [[ "$dominio" =~ $re_dominio ]]; then
  echo "Dominio no válido: «$dominio» (sin https ni www, p. ej. tudominio.com)." >&2
  exit 1
fi
if ! [[ "$correo" =~ $re_correo ]]; then
  echo "Correo no válido: «$correo»." >&2
  exit 1
fi
if ! [[ "$personas" =~ $re_personas ]]; then
  echo "Personas no válidas: «$personas» (nombres en minúsculas separados por comas)." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  bash deploy/setup-vps.sh
fi

# SSH solo con clave. Si este script corre es porque se ha entrado con la clave: ya no hacen falta contraseñas.
if [ -s /root/.ssh/authorized_keys ] && [ ! -f /etc/ssh/sshd_config.d/01-endurecido.conf ]; then
  printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/01-endurecido.conf
  if sshd -t; then
    systemctl reload ssh
    echo "==> SSH: solo con clave"
  else
    rm -f /etc/ssh/sshd_config.d/01-endurecido.conf
    echo "AVISO: no se ha podido cerrar SSH a contraseñas (la configuración no pasaba sshd -t); se deja como estaba."
  fi
fi

if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  codigos=""
  IFS=',' read -ra nombres <<< "$personas"
  for nombre in "${nombres[@]}"; do
    codigos+="${codigos:+,}${nombre}:$(openssl rand -base64 18 | tr '+/' '-_')"
  done
  sed -i "s|^DOMAIN=.*|DOMAIN=${dominio}|; s|^ACME_EMAIL=.*|ACME_EMAIL=${correo}|; s|^ACCESS_CODES=.*|ACCESS_CODES=${codigos}|" .env
  echo "==> .env creado (sin clave de Anthropic: sin IA) con un código para: ${personas}"
else
  echo "==> .env ya existía: no se toca"
fi

# Aviso si el DNS aún no apunta aquí: sin eso, Caddy no consigue los certificados (lo reintenta solo).
ips_vps=" $(hostname -I) "
for nombre in "$dominio" "www.$dominio"; do
  ip=$(getent ahostsv4 "$nombre" | awk 'NR==1 {print $1}' || true)
  if [ -z "$ip" ] || [[ "$ips_vps" != *" $ip "* ]]; then
    echo "AVISO: ${nombre} no apunta a este VPS (${ip:-sin registro}). Revisa el DNS (DESPLIEGUE.md, paso 1)."
  fi
done

echo "==> Construyendo y arrancando (la primera vez tarda unos minutos)"
docker compose up -d --build
docker image prune -f >/dev/null
docker compose ps
echo
echo "Listo: https://${dominio} (presentación) y https://${dominio}/app/ (app)."
echo "Códigos de acceso: grep ACCESS_CODES /opt/fitness/.env"
