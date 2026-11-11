# Servidor de análisis de comidas. Se construye desde docker-compose.yml (raíz del repositorio).
FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
# --ignore-scripts: ninguna dependencia ejecuta código al instalarse (no lo necesitan: son JavaScript puro).
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

COPY index.js ./
COPY src ./src
COPY scripts ./scripts

# Sin permisos de administrador dentro del contenedor.
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "index.js"]
