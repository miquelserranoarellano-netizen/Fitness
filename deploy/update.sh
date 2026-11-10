#!/usr/bin/env bash
# Actualiza la app en el VPS con lo último de GitHub (rama main) y la vuelve a levantar:
#   bash deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only
docker compose up -d --build
docker image prune -f
docker compose ps
echo
echo "Comprueba: curl -s https://\$(grep '^DOMAIN=' .env | cut -d= -f2)/api/health"
