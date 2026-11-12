# Web de IKYNDO servida por Caddy, que además pone HTTPS y pasa /api al servidor: la presentación en HTML
# (deploy/landing/, en /) y la app de Expo para navegador (en /app). Se construye desde docker-compose.yml
# (contexto: la raíz del repositorio).

# 1. Compilar la app (con experiments.baseUrl "/app" de app.json).
FROM node:24-bookworm-slim AS build
ENV EXPO_NO_TELEMETRY=1 CI=1
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY app/ ./
# El servidor está en el mismo dominio, en /api (lo reparte Caddy). Va dentro de la web: nada secreto aquí.
ARG EXPO_PUBLIC_API_URL=/api
ENV EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL}
# IA apagada: la app no enseña nada de análisis con IA (app/src/lib/features.ts). Para encenderla, «on» aquí y
# ANTHROPIC_API_KEY en el .env (cada análisis gasta tokens de esa clave).
ARG EXPO_PUBLIC_AI=off
ENV EXPO_PUBLIC_AI=${EXPO_PUBLIC_AI}
RUN npx expo export --platform web --output-dir dist
# La presentación no se compila: HTML, CSS y el logo.
COPY deploy/landing/ /landing/
# Versiones .br y .gz de cada archivo, para que Caddy no tenga que comprimir en cada visita.
COPY deploy/precompress.mjs /tmp/precompress.mjs
RUN node /tmp/precompress.mjs dist && node /tmp/precompress.mjs /landing

# 2. Servirlas.
FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv/app
COPY --from=build /landing /srv/landing
