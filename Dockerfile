# syntax=docker/dockerfile:1

# ---------- Étape 1 : construction du jeu (Vite + TypeScript) ----------
FROM node:22-alpine AS build
WORKDIR /app

# Dépendances d'abord, pour profiter du cache Docker tant que package*.json ne change pas
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---------- Étape 2 : nginx sert les fichiers statiques ----------
FROM nginx:1.27-alpine AS runtime

# Le port d'écoute interne est configurable (variable PORT). Le modèle est rendu
# par le script d'entrée de l'image nginx officielle (envsubst) au démarrage.
ENV PORT=8080
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1
