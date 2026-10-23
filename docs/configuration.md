# Configuration

Jellyfied is configured with environment variables. With Docker Compose, set them in a `.env`
file next to `docker-compose.yml` (copy `.env.example`) or edit `docker-compose.yml` directly;
with plain `docker run`, pass them with `-e`. Changes take effect when the container is recreated.

| Variable                | Default                    | Description |
| ----------------------- | -------------------------- | ----------- |
| `JELLYFIN_URL`          | _(empty)_ ¹                | Jellyfin address seen from the container. Enables the built-in reverse proxy at `/jellyfin`, so the browser only ever talks to Jellyfied (no CORS or mixed-content problems, one URL to expose). |
| `JELLYFIN_PUBLIC_URL`   | _(empty)_                  | Address the browser should use to reach Jellyfin directly, e.g. `https://jellyfin.example.com`. Overrides the proxy for API and media requests. |
| `JELLYFIED_LOCK_SERVER` | `true` if a server is set  | When `true`, users can't switch to a different server on the login screen. |
| `JELLYFIED_BASE_PATH`   | _(empty)_                  | Serve Jellyfied under a path, e.g. `/jellyfied`, for reverse proxies that give each app a path instead of a host name. The proxy to Jellyfin moves with it (`/jellyfied/jellyfin`). |
| `JELLYFIED_PORT`        | `80`                       | Port nginx listens on inside the container. |
| `JELLYFIED_TRUSTED_PROXIES` | `private`              | Whose `X-Forwarded-For` header is believed: the reverse proxy or tunnel in front of Jellyfied. Addresses or networks separated by spaces (`172.18.0.0/16 10.0.0.2`), `private` for loopback and the private ranges, or `none`. |
| `JELLYFIED_DATA_DIR`        | `/var/lib/jellyfied`   | Where the SyncPlay picker and the stats comparisons keep their state between restarts. The image declares it as a volume; `docker-compose.yml` names it `jellyfied-data`. On a read-only file system the state is kept in memory only. |
| `JELLYFIED_STATS_MIN_USERS` | `3` | How many people have to take part before Your stats compares anyone with the others (at least 2). With two, any comparison tells each about the other. |

¹ The Compose file sets it to `http://host.docker.internal:8096` unless you choose another value.

If neither URL is set, the login screen asks for the server address. Jellyfin allows cross-origin
requests by default, so this works without a proxy too.

Docker Compose additionally understands these:

| Variable                 | Default    | Description |
| ------------------------ | ---------- | ----------- |
| `JELLYFIED_HOST_PORT`    | `8080`     | Port Jellyfied is reachable on. |
| `JELLYFIED_BIND_ADDRESS` | `0.0.0.0`  | Address the port is published on. Use `127.0.0.1` to make Jellyfied reachable from the Docker host only, for example when a reverse proxy runs in front of it. |

## Notes

- Real client IPs: in proxy mode Jellyfin sees every request coming from Jellyfied, and shows
  that address for all devices unless it is told to trust it. Two things make the dashboard show
  where people really connect from:
  1. In Jellyfin, add the address Jellyfied connects from under *Dashboard → Networking → Known
     proxies* and restart Jellyfin: the container's IP or Docker subnet, or, when Jellyfin runs
     on the Docker host, Docker's gateway (`127.0.0.1` with Docker Desktop). If the dashboard
     shows one private address for every device, that is the address to add.
  2. If a reverse proxy or tunnel sits in front of Jellyfied, it has to be trusted too. Proxies
     on private addresses are by default; for others, set `JELLYFIED_TRUSTED_PROXIES`.

  Jellyfied then passes on one address: the last one in `X-Forwarded-For` that is not a trusted
  proxy. With Docker Desktop (macOS, Windows), visitors who reach the published port directly
  still all appear as Docker's gateway, because Docker hides their addresses from the container.

  **If the published port is reachable from the internet without a reverse proxy in front**, the
  default (`private`) is not safe: where Docker's gateway is the peer for every visitor (Docker
  Desktop, rootless Docker, the userland proxy, IPv6 publishing), anyone can send
  `X-Forwarded-For: 192.168.1.10` and Jellyfin treats them as being on the LAN, which skips
  "allow remote connections" and the remote bitrate limit. Set `JELLYFIED_TRUSTED_PROXIES` to the
  proxy's own address, or to `none` when there is no proxy.
- HTTPS: put Jellyfied behind your usual reverse proxy (Traefik, Caddy, nginx, …) the same way
  you would any web app. In proxy mode, Jellyfin doesn't need to be exposed at all.
- The container serves a health check at `/healthz`.
- nginx runs as an unprivileged user (uid 101), not as root. Docker lets it listen on port 80
  anyway; on runtimes that don't (some Kubernetes and rootless setups), set `JELLYFIED_PORT=8080`
  and publish that port instead.
- The container sends a strict Content-Security-Policy: scripts and styles only from Jellyfied
  itself, plus WebAssembly (for styled subtitles) and Google's Cast script when Chromecast is used.
  When it proxies Jellyfin and the server is locked (no `JELLYFIN_PUBLIC_URL`), API calls and
  media are also limited to Jellyfied's own address; otherwise they may go anywhere, since the
  server can live elsewhere.
- The SyncPlay picker endpoints are rate-limited to 10 requests a second per address (bursts of
  up to 50), since each one checks the caller with Jellyfin.
- Under a base path, a reverse proxy in front has to pass the path on unchanged (no stripping).
- Jellyfied stores only the session tokens of the signed-in accounts and UI preferences in the
  browser's local storage.
