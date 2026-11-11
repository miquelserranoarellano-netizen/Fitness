# Web de la app (Expo para navegador) servida por Caddy, que además pone HTTPS y pasa /api al servidor.
# Se construye desde docker-compose.yml (contexto: la raíz del repositorio).

# 1. Compilar la web.
FROM node:24-bookworm-slim AS build
ENV EXPO_NO_TELEMETRY=1 CI=1
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY app/ ./
# El servidor está en el mismo dominio, en /api (lo reparte Caddy). Va dentro de la web: nada secreto aquí.
ARG EXPO_PUBLIC_API_URL=/api
ENV EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL}
RUN npx expo export --platform web --output-dir dist
# Versiones .br y .gz de cada archivo, para que Caddy no tenga que comprimir en cada visita.
COPY deploy/precompress.mjs /tmp/precompress.mjs
RUN node /tmp/precompress.mjs dist

# 2. Servirla.
FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
