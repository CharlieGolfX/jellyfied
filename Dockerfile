# syntax=docker/dockerfile:1
# The base images are pinned by digest, so the same commit builds from the same images; Dependabot
# moves the pins (tag and digest together) when new ones come out.

# ---- Build ------------------------------------------------------------------
# The site is the same for every CPU architecture, so it is built once, on the build machine's own.
FROM --platform=$BUILDPLATFORM node:26.12-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && node scripts/precompress.mjs dist

# ---- Runtime ----------------------------------------------------------------
# nginx without root: the image's own entrypoint and nginx itself run as the "nginx" user (101).
FROM nginxinc/nginx-unprivileged:1.30-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03

LABEL org.opencontainers.image.title="Jellyfied" \
      org.opencontainers.image.description="A web frontend for Jellyfin"

# The nginx image runs every script in /docker-entrypoint.d before starting. That script writes the
# site's nginx config, config.js and index.html, so those places belong to the nginx user.
USER root
COPY docker/40-jellyfied.sh /docker-entrypoint.d/40-jellyfied.sh
COPY docker/syncplay-picker.js docker/stats-compare.js /etc/nginx/njs/
# The base image's packages are brought up to date, so fixes published after it was built are in.
# A deliberate trade: security fixes reach the image without waiting for a new base image, at the
# cost of a rebuild of the same commit possibly getting newer Alpine packages than the last one.
RUN apk upgrade --no-cache \
    && chmod +x /docker-entrypoint.d/40-jellyfied.sh \
    && rm -f /etc/nginx/conf.d/default.conf \
    && sed -i '1i load_module modules/ngx_http_js_module.so;' /etc/nginx/nginx.conf \
    && chown -R 101:101 /etc/nginx/conf.d \
    && mkdir -p /var/lib/jellyfied \
    && chown 101:101 /var/lib/jellyfied

COPY --from=build --chown=101:101 /app/dist /usr/share/nginx/html
USER 101

ENV JELLYFIN_URL="" \
    JELLYFIN_PUBLIC_URL="" \
    JELLYFIED_BASE_PATH="" \
    JELLYFIED_TRUSTED_PROXIES="private" \
    JELLYFIED_PORT=80

# The SyncPlay picker's state (suggestions, votes, spins) and the stats comparisons' summaries,
# kept across restarts and updates.
VOLUME /var/lib/jellyfied

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${JELLYFIED_PORT}/healthz" || exit 1
