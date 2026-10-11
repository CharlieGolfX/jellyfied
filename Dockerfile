# syntax=docker/dockerfile:1

# ---- Build ------------------------------------------------------------------
# The site is the same for every CPU architecture, so it is built once, on the build machine's own.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- Runtime ----------------------------------------------------------------
FROM nginx:1.28-alpine

LABEL org.opencontainers.image.title="Jellyplex" \
      org.opencontainers.image.description="A Plex-style web frontend for Jellyfin"

# The nginx image runs every script in /docker-entrypoint.d before starting.
COPY docker/40-jellyplex.sh /docker-entrypoint.d/40-jellyplex.sh
RUN chmod +x /docker-entrypoint.d/40-jellyplex.sh \
    && rm -f /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

ENV JELLYFIN_URL="" \
    JELLYFIN_PUBLIC_URL="" \
    JELLYPLEX_PORT=80

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${JELLYPLEX_PORT}/healthz" || exit 1
