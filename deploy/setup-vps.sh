#!/usr/bin/env bash
# Prepara un VPS Ubuntu 24.04 recién creado (IONOS) para la app: Docker, cortafuegos, actualizaciones de
# seguridad automáticas, fail2ban para SSH y memoria de intercambio. Una sola vez, como root:
#   sudo bash deploy/setup-vps.sh
# No toca la configuración de SSH: eso va a mano (DESPLIEGUE.md, paso 2), para no dejarte fuera.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Ejecútalo con sudo." >&2
  exit 1
fi

. /etc/os-release
echo "==> Sistema: ${PRETTY_NAME}"
export DEBIAN_FRONTEND=noninteractive

echo "==> Actualizando paquetes"
apt-get update
apt-get -y upgrade
apt-get install -y ca-certificates curl git ufw fail2ban unattended-upgrades

echo "==> Docker (repositorio oficial)"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

echo "==> Cortafuegos: solo SSH, HTTP y HTTPS"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> fail2ban: bloquea durante 1 h a quien falle 5 veces al entrar por SSH"
cat > /etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

echo "==> Actualizaciones de seguridad automáticas"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

# Compilar la web necesita unos 2-3 GB de memoria: en un VPS pequeño, se añade intercambio.
total_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$total_mb" -lt 3500 ] && ! swapon --show | grep -q .; then
  echo "==> Memoria de intercambio de 2 GB (el VPS tiene ${total_mb} MB)"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo
echo "Listo. Comprueba:"
echo "  docker --version && docker compose version"
echo "  ufw status"
echo "  fail2ban-client status sshd"
