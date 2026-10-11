# syntax=docker/dockerfile:1

# ---- Build ------------------------------------------------------------------
# The site is the same for every CPU architecture, so it is built once, on the build machine's own.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && node scripts/precompress.mjs dist

# ---- Runtime ----------------------------------------------------------------
# nginx without root: the image's own entrypoint and nginx itself run as the "nginx" user (101).
FROM nginxinc/nginx-unprivileged:1.30-alpine

LABEL org.opencontainers.image.title="Jellyplex" \
      org.opencontainers.image.description="A Plex-style web frontend for Jellyfin"

# The nginx image runs every script in /docker-entrypoint.d before starting. That script writes the
# site's nginx config, config.js and index.html, so those places belong to the nginx user.
USER root
COPY docker/40-jellyplex.sh /docker-entrypoint.d/40-jellyplex.sh
# The base image's packages are brought up to date, so fixes published after it was built are in.
RUN apk upgrade --no-cache \
    && chmod +x /docker-entrypoint.d/40-jellyplex.sh \
    && rm -f /etc/nginx/conf.d/default.conf \
    && chown -R 101:101 /etc/nginx/conf.d

COPY --from=build --chown=101:101 /app/dist /usr/share/nginx/html
USER 101

ENV JELLYFIN_URL="" \
    JELLYFIN_PUBLIC_URL="" \
    JELLYPLEX_BASE_PATH="" \
    JELLYPLEX_TRUSTED_PROXIES="private" \
    JELLYPLEX_PORT=80

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${JELLYPLEX_PORT}/healthz" || exit 1
