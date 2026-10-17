#!/bin/sh
# Generates Jellyfied's runtime config and nginx site from environment variables.
# Runs automatically via the nginx image's /docker-entrypoint.d hook.
#
#   JELLYFIN_URL           Jellyfin address as seen from this container, e.g. http://jellyfin:8096.
#                          Enables the built-in reverse proxy at /jellyfin (no CORS, single origin).
#   JELLYFIN_PUBLIC_URL    Optional. Address the *browser* should use instead of the proxy,
#                          e.g. https://jellyfin.example.com. Overrides the proxy for API calls.
#   JELLYFIED_LOCK_SERVER  true/false. Hide "change server" on the login screen (default: true
#                          when a server is configured).
#   JELLYFIED_PORT         Port nginx listens on inside the container (default 80).
#   JELLYFIED_BASE_PATH    Optional. Serve Jellyfied under this path, e.g. /jellyfied, for reverse
#                          proxies that give every app a path instead of a host name.
#   JELLYFIED_TRUSTED_PROXIES  Addresses or networks (CIDR), separated by spaces or commas, whose
#                          X-Forwarded-For header is believed: a reverse proxy or tunnel in front
#                          of Jellyfied, and Docker's own gateway. Default "private" (loopback
#                          and the private ranges); "none" trusts nobody.
#
# nginx runs as an unprivileged user, so everything written here lives in places that user owns.
set -eu

HTML_DIR=/usr/share/nginx/html
CONF=/etc/nginx/conf.d/default.conf
HEADERS=/tmp/jellyfied-headers.conf
PROXY_PATH=/jellyfin

JELLYFIN_URL="${JELLYFIN_URL:-}"
JELLYFIN_PUBLIC_URL="${JELLYFIN_PUBLIC_URL:-}"
LISTEN_PORT="${JELLYFIED_PORT:-80}"

log() { echo "jellyfied: $*"; }

# Base path: "/jellyfied" (leading slash, no trailing one), or empty for the root.
BASE=$(printf '%s' "${JELLYFIED_BASE_PATH:-}" | sed -e 's:^/*:/:' -e 's:/*$::')
[ "$BASE" = "/" ] && BASE=""
case "$BASE" in
  *[!A-Za-z0-9/._~-]*)
    log "JELLYFIED_BASE_PATH may only contain letters, digits and / . _ ~ -; ignoring \"$BASE\""
    BASE=""
    ;;
esac

# Who may say where a request really came from. Behind a reverse proxy, a tunnel or Docker's port
# forwarding, the peer nginx sees is that middleman; the visitor's address is in X-Forwarded-For.
# nginx takes the last address in that header that is not itself a trusted proxy, and that is the
# address it logs and hands to Jellyfin.
TRUSTED=$(printf '%s' "${JELLYFIED_TRUSTED_PROXIES:-private}" | tr ',' ' ')
case "$TRUSTED" in
  private) TRUSTED="127.0.0.0/8 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 ::1 fc00::/7 fe80::/10" ;;
  none | off | false) TRUSTED="" ;;
esac
REAL_IP=""
for NET in $TRUSTED; do
  case "$NET" in
    *[!0-9A-Fa-f:./]*) log "JELLYFIED_TRUSTED_PROXIES: ignoring \"$NET\", not an address or network" ;;
    *) REAL_IP="${REAL_IP}
    set_real_ip_from ${NET};" ;;
  esac
done
if [ -n "$REAL_IP" ]; then
  REAL_IP="${REAL_IP}
    real_ip_header X-Forwarded-For;
    real_ip_recursive on;"
  log "trusting X-Forwarded-For from: $(echo $TRUSTED)"
else
  log "not trusting X-Forwarded-For from anyone"
fi

# Strip trailing slashes.
JELLYFIN_URL=$(printf '%s' "$JELLYFIN_URL" | sed 's:/*$::')
JELLYFIN_PUBLIC_URL=$(printf '%s' "$JELLYFIN_PUBLIC_URL" | sed 's:/*$::')

if [ -n "$JELLYFIN_PUBLIC_URL" ]; then
  BROWSER_SERVER="$JELLYFIN_PUBLIC_URL"
elif [ -n "$JELLYFIN_URL" ]; then
  BROWSER_SERVER="${BASE}${PROXY_PATH}"
else
  BROWSER_SERVER=""
fi

if [ -n "$BROWSER_SERVER" ]; then DEFAULT_LOCK=true; else DEFAULT_LOCK=false; fi
case "$(printf '%s' "${JELLYFIED_LOCK_SERVER:-$DEFAULT_LOCK}" | tr '[:upper:]' '[:lower:]')" in
  1 | true | yes | on) LOCK=true ;;
  *) LOCK=false ;;
esac

js_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/</\\u003c/g'; }

cat >"$HTML_DIR/config.js" <<EOF
window.JELLYFIED_CONFIG = {
  serverUrl: "$(js_escape "$BROWSER_SERVER")",
  lockServer: $LOCK
};
EOF
log "browser server URL: ${BROWSER_SERVER:-<user chooses at login>} (locked: $LOCK)"

# The page finds its scripts, styles and config relative to its <base> tag.
sed "s|<base href=\"[^\"]*\"|<base href=\"${BASE}/\"|" "$HTML_DIR/index.html" >/tmp/jellyfied-index.html
cat /tmp/jellyfied-index.html >"$HTML_DIR/index.html"
rm -f /tmp/jellyfied-index.html
[ -n "$BASE" ] && log "serving under ${BASE}/"

BASE_BLOCK=""
if [ -n "$BASE" ]; then
  # Requests under the base path are handled as if they had been made without it.
  BASE_BLOCK="
    location = ${BASE} {
        return 301 ${BASE}/;
    }

    location ^~ ${BASE}/ {
        rewrite ^${BASE}(/.*)\$ \$1 last;
    }
"
fi

# ---------------------------------------------------------------------------
# nginx site
# ---------------------------------------------------------------------------
LISTEN="listen ${LISTEN_PORT};"
if [ -f /proc/net/if_inet6 ]; then
  LISTEN="$LISTEN
    listen [::]:${LISTEN_PORT};"
fi

PROXY_BLOCK=""
UPSTREAM_BLOCK=""
if [ -n "$JELLYFIN_URL" ]; then
  case "$JELLYFIN_URL" in
    http://* | https://*) ;;
    *) JELLYFIN_URL="http://$JELLYFIN_URL" ;;
  esac
  SCHEME="${JELLYFIN_URL%%://*}"
  REST="${JELLYFIN_URL#*://}"
  HOSTPORT="${REST%%/*}"
  case "$REST" in
    */*) BASE_PATH="/${REST#*/}" ;;
    *) BASE_PATH="" ;;
  esac
  case "$HOSTPORT" in
    \[*) HOST="${HOSTPORT%%]*}]"; PORT_PART="${HOSTPORT#"$HOST"}" ;;
    *) HOST="${HOSTPORT%%:*}"; PORT_PART="${HOSTPORT#"$HOST"}" ;;
  esac
  PORT="${PORT_PART#:}"
  if [ -z "$PORT" ]; then
    if [ "$SCHEME" = "https" ]; then PORT=443; else PORT=80; fi
  fi

  SSL_DIRECTIVES=""
  if [ "$SCHEME" = "https" ]; then
    SSL_DIRECTIVES="proxy_ssl_server_name on;
        proxy_ssl_name ${HOST};"
  fi

  # Hosts defined in /etc/hosts (e.g. extra_hosts: host.docker.internal:host-gateway) are only
  # visible to the system resolver, so use a static upstream for them. Everything else is
  # resolved at request time so Jellyfied starts even when Jellyfin is temporarily down.
  if grep -qE "[[:space:]]${HOST}([[:space:]]|\$)" /etc/hosts 2>/dev/null; then
    # Use the addresses themselves, and only the IPv4 ones when there are any: Docker Desktop also
    # lists an IPv6 address for host.docker.internal that containers usually cannot reach, and nginx
    # would send part of the requests there (failed requests, dropped WebSocket connections).
    ADDRS=$(awk -v h="$HOST" '$1 !~ /^#/ { for (i = 2; i <= NF; i++) if ($i == h) print $1 }' /etc/hosts)
    V4=$(printf '%s\n' "$ADDRS" | grep -v ':' || true)
    if [ -n "$V4" ]; then
      ADDRS="$V4"
    else
      ADDRS=$(printf '%s\n' "$ADDRS" | sed 's/.*/[&]/')
    fi
    SERVERS=""
    for ADDR in $ADDRS; do
      SERVERS="${SERVERS}
    server ${ADDR}:${PORT};"
    done
    UPSTREAM_BLOCK="upstream jellyfin_backend {${SERVERS}
    keepalive 16;
}"
    UPSTREAM_TARGET="${SCHEME}://jellyfin_backend${BASE_PATH}"
    RESOLVER=""
    log "proxying ${PROXY_PATH}/ -> ${SCHEME}://${HOST}:${PORT}${BASE_PATH} (static upstream from /etc/hosts: $(echo $ADDRS))"
  else
    NS=$(awk '/^nameserver/ { print $2; exit }' /etc/resolv.conf 2>/dev/null || true)
    case "$NS" in
      *:*) NS="[$NS]" ;;
    esac
    [ -z "$NS" ] && NS="127.0.0.11"
    RESOLVER="resolver ${NS} valid=30s ipv6=off;
        resolver_timeout 5s;"
    UPSTREAM_TARGET="${SCHEME}://${HOSTPORT}${BASE_PATH}"
    log "proxying ${PROXY_PATH}/ -> ${UPSTREAM_TARGET} (resolver ${NS})"
  fi

  PROXY_BLOCK="
    # Reverse proxy to Jellyfin. The original, still-encoded request URI is forwarded unchanged
    # (minus the ${PROXY_PATH} prefix) so names containing special characters keep working.
    location = ${PROXY_PATH} {
        return 301 ${PROXY_PATH}/;
    }

    location ${PROXY_PATH}/ {
        ${RESOLVER}
        set \$jellyfin_upstream \"${UPSTREAM_TARGET}\";
        proxy_pass \$jellyfin_upstream\$jellyfin_path;

        proxy_http_version 1.1;
        proxy_set_header Host ${HOSTPORT};
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        # The visitor's address as worked out above, and nothing else: Jellyfin stops at the first
        # address in a longer list that it does not know as a proxy, which would be a middleman.
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$http_host;
        ${SSL_DIRECTIVES}

        # Streaming friendly: no buffering, long timeouts, large uploads (images, subtitles).
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        client_max_body_size 0;
    }

    # The SyncPlay picker: suggestions, votes and the wheel (/etc/nginx/njs/syncplay-picker.js).
    location ^~ /jellyfied-api/syncplay/ {
        client_max_body_size 4k;
        add_header Cache-Control \"no-store\" always;
        include ${HEADERS};
        js_content picker.serve;
    }

    # How the picker asks Jellyfin who is calling and whether they are in the group: with the
    # caller's own headers, so with their own token and rights.
    location ~ ^/_jellyfied_jellyfin(?<jellyfin_sub>/.*)\$ {
        internal;
        ${RESOLVER}
        set \$jellyfin_upstream \"${UPSTREAM_TARGET}\";
        proxy_pass \$jellyfin_upstream\$jellyfin_sub;
        proxy_method GET;
        proxy_pass_request_body off;
        proxy_set_header Content-Length \"\";
        proxy_set_header Content-Type \"\";
        proxy_set_header Accept-Encoding \"\";
        proxy_set_header Host ${HOSTPORT};
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        ${SSL_DIRECTIVES}
        subrequest_output_buffer_size 256k;
    }"
fi

# Security headers for everything Jellyfied itself serves. nginx drops inherited add_header lines in
# any location that sets its own, so each location includes this file instead of relying on the
# server block. The proxied Jellyfin responses only get the server-level headers: the policy below
# is written for Jellyfied and would break Jellyfin's own web interface.
#
# Images, media and API calls may go to any address, because the Jellyfin server can live on
# another origin (JELLYFIN_PUBLIC_URL, or one typed on the login screen). Scripts cannot, with two
# exceptions: WebAssembly ('wasm-unsafe-eval'), which draws styled subtitles, and Google's Cast SDK
# on www.gstatic.com, which is only loaded when someone picks Chromecast.
cat >"$HEADERS" <<EOF
add_header X-Content-Type-Options nosniff always;
add_header Referrer-Policy same-origin always;
add_header X-Frame-Options DENY always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://www.gstatic.com; style-src 'self'; img-src * data: blob:; media-src * data: blob:; connect-src * ws: wss: data: blob:; font-src 'self' data:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
EOF

cat >"$CONF" <<EOF
# Generated by /docker-entrypoint.d/40-jellyfied.sh — edits are overwritten on start.

map \$http_upgrade \$connection_upgrade {
    default upgrade;
    ''      close;
}

# Access tokens travel in the query string for media elements and the WebSocket (api_key=...), so
# keep them out of the access log.
map \$request \$jellyfied_logged_request {
    "~*^(?<log_head>.*[?&]api_?key=)[^&\s]*(?<log_tail>.*)\$" "\${log_head}***\${log_tail}";
    default \$request;
}

log_format jellyfied '\$remote_addr - \$remote_user [\$time_local] "\$jellyfied_logged_request" '
                     '\$status \$body_bytes_sent "\$http_referer" "\$http_user_agent"';

map \$request_uri \$jellyfin_path {
    ~^${BASE}${PROXY_PATH}(?<rest>/.*)\$ \$rest;
    ~^${PROXY_PATH}(?<rest>/.*)\$ \$rest;
    default /;
}

${UPSTREAM_BLOCK}

# The SyncPlay picker's state lives in memory shared by the workers, for as long as groups last.
js_engine qjs;
js_path /etc/nginx/njs;
js_import picker from syncplay-picker.js;
js_shared_dict_zone zone=jellyfied_syncplay:4m timeout=24h evict;

server {
    ${LISTEN}
    server_name _;
    root ${HTML_DIR};
    index index.html;
    server_tokens off;
    absolute_redirect off;
    access_log /var/log/nginx/access.log jellyfied;
${REAL_IP}

    gzip on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/javascript application/javascript application/json application/wasm image/svg+xml;
    # The build ships a .gz next to its larger files; those are sent as they are.
    gzip_static on;

    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy same-origin always;
    add_header X-Frame-Options SAMEORIGIN always;

${BASE_BLOCK}
    location = /healthz {
        access_log off;
        default_type text/plain;
        return 200 "ok\n";
    }

    location = /config.js {
        add_header Cache-Control "no-store" always;
        include ${HEADERS};
    }

    # Hashed build assets never change.
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        include ${HEADERS};
        try_files \$uri =404;
    }

    # Jellyfied's own API. Only the SyncPlay picker is behind it, and only with the proxy above.
    location ^~ /jellyfied-api/ {
        default_type application/json;
        include ${HEADERS};
        return 404 '{"code":"notAvailable","error":"Not available"}';
    }
${PROXY_BLOCK}

    # Client-side routing: unknown paths serve the app shell.
    location / {
        add_header Cache-Control "no-cache" always;
        include ${HEADERS};
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

log "nginx listening on port ${LISTEN_PORT}"
