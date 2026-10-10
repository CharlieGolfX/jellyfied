# Jellyplex

A web frontend for an existing [Jellyfin](https://jellyfin.org) server, with a layout modelled on Plex,
Jellyfin's own colour scheme and logo, and a full server dashboard for administrators. It runs as a
small nginx container. Your Jellyfin server is not modified: Jellyplex is just another client.

![Movies library, Recommended tab](docs/screenshots/movies-recommended.jpg)

## Screenshots

| Library view | Movie details |
| --- | --- |
| ![Movies library grid with sorting and filters](docs/screenshots/movies-library.jpg) | ![Movie detail page with cast and media info](docs/screenshots/movie-details.jpg) |

| Show details | Account settings |
| --- | --- |
| ![Show detail page with seasons](docs/screenshots/show-details.jpg) | ![Account and playback settings](docs/screenshots/account-settings.png) |

## Features

**Browsing (Plex layout)**
- Top bar with global search (type `/` to focus) and live results, collapsible library sidebar, account menu.
- Drag libraries in the sidebar to reorder them. The order is saved to your Jellyfin account, so it
  also applies to the home page and other Jellyfin apps.
- Home: Continue Watching (in-progress plus next-up episodes merged, like Plex's On Deck),
  Continue Listening, and Recently Added per library.
- Libraries with Plex-style tabs: Recommended / Library / Collections / Categories for movies and TV,
  Albums / Artists / Genres for music, and folder browsing for home videos, photos, books and mixed libraries.
  Sorting, watched/unwatched/in-progress/favorite filters, genre filter and infinite scroll.
- Adjustable poster size on every page (top-bar zoom button, or the slider in library views). The
  setting applies to every row and grid and is remembered.
- Detail pages for movies, shows, seasons, episodes, albums, artists, playlists, collections, people,
  genres and studios. Backdrop hero, ratings, cast & crew, extras, trailers, "More Like This", and
  version/audio/subtitle pickers.
- Shuffle button on folder-based libraries and folder pages. It plays everything below the folder,
  including subfolders.
- Unwatched corner badges, progress bars, watched toggles and favorites everywhere.

**Playback**
- Video player with direct play when the browser supports the file, and automatic HLS transcoding
  (hls.js) when it doesn't. A failed direct play falls back to a transcode automatically.
- Audio track, subtitle, quality and playback speed (0.5×–2×) switching. Text subtitles
  (SRT/ASS/VTT, embedded or sidecar) are converted to WebVTT. Image subtitles (PGS/VobSub) are
  burned in by the server.
- Resume, chapter markers, thumbnail previews on the seek bar (when the server has generated
  trickplay images), Skip Intro / Credits (when the server has media segments),
  Up Next with auto-play (honours the user's preference), keyboard shortcuts.
- "Ends at" clock in the player controls, showing when the video will finish at the current
  playback speed.
- Picture-in-picture, from the player or the mini player, plus OS media controls (media keys,
  lock screen) for video.
- Mini player: press Back (or `Esc`) in the player and the video keeps playing in a small window,
  so you can browse and read media info while streaming. Click it to expand, or use its controls to
  pause or stop. Starting music pauses the video.
- Persistent music player bar with queue, shuffle, repeat and OS media keys.
- Instant Mix: start a queue of similar music from any song, album, artist, genre or playlist.
- Playback progress, watched state and "Now Playing" are reported to Jellyfin, and transcodes are
  stopped when you leave the player.

**Server dashboard (administrators)**
- Dashboard: active streams with transcode details and remote pause/stop/message, active devices,
  library counts, storage, running tasks, recent activity, scan/restart/shutdown.
- General settings, Users (create, delete, permissions, library access, passwords),
  Libraries (add with a server-side folder browser, rename, add/remove folders, scan, refresh metadata, remove),
  Transcoding (hardware acceleration, encoder settings, throttling, resume thresholds),
  Networking, Scheduled Tasks, Activity log, Devices, Plugins (installed and catalog, with a
  Configure link that opens the plugin's settings page in the Jellyfin web UI),
  API keys and a Log viewer.

**Account**
- Quick Connect sign-in and authorization, profile picture, password, playback language and subtitle
  preferences, and per-device settings for streaming quality and time display (24-hour by default,
  or 12-hour).

## Installation

Jellyplex needs a running Jellyfin server (10.9 or newer, 10.11 recommended) and Docker with the
Compose plugin. There is no prebuilt image yet, so the container is built from source.

### Docker Compose

1. Clone the repository:

   ```bash
   git clone https://github.com/CharlieGolfX/jellyplex.git
   cd jellyplex
   ```

2. Open `docker-compose.yml` and set `JELLYFIN_URL` to your Jellyfin server, as reachable from
   inside the Jellyplex container:

   | Where Jellyfin runs                    | `JELLYFIN_URL`                                                         |
   | -------------------------------------- | ---------------------------------------------------------------------- |
   | Same Docker network / compose project  | `http://jellyfin:8096`                                                 |
   | On the Docker host                     | `http://host.docker.internal:8096` (the compose file maps it on Linux) |
   | Another machine                        | `http://192.168.1.10:8096`                                             |
   | Behind a base URL                      | `http://jellyfin:8096/jellyfin`                                        |

3. Build and start the container:

   ```bash
   docker compose up -d --build
   ```

4. Open `http://localhost:8080` and sign in with your Jellyfin account.

To update later, pull the latest changes and rebuild:

```bash
git pull
docker compose up -d --build
```

### Docker without Compose

```bash
git clone https://github.com/CharlieGolfX/jellyplex.git
cd jellyplex
docker build -t jellyplex .
docker run -d --name jellyplex -p 8080:80 \
  -e JELLYFIN_URL=http://192.168.1.10:8096 \
  --restart unless-stopped jellyplex
```

### Static hosting without Docker

`npm run build` produces a static site in `dist/`. Serve it with any web server that falls back to
`index.html` for unknown paths, and edit `dist/config.js` to point `serverUrl` at your Jellyfin
server. In this mode the browser talks to Jellyfin directly, which works because Jellyfin allows
cross-origin requests by default.

## Configuration

All configuration happens through environment variables, applied each time the container starts.

| Variable                | Default                    | Description |
| ----------------------- | -------------------------- | ----------- |
| `JELLYFIN_URL`          | _(empty)_                  | Jellyfin address seen from the container. Enables the built-in reverse proxy at `/jellyfin`, so the browser only ever talks to Jellyplex (no CORS or mixed-content problems, one URL to expose). |
| `JELLYFIN_PUBLIC_URL`   | _(empty)_                  | Address the browser should use to reach Jellyfin directly, e.g. `https://jellyfin.example.com`. Overrides the proxy for API and media requests. |
| `JELLYPLEX_LOCK_SERVER` | `true` if a server is set  | When `true`, users can't switch to a different server on the login screen. |
| `JELLYPLEX_PORT`        | `80`                       | Port nginx listens on inside the container. |

If neither URL is set, the login screen asks for the server address. Jellyfin allows cross-origin
requests by default, so this works without a proxy too.

### Notes

- Real client IPs: in proxy mode Jellyfin sees requests coming from the Jellyplex container.
  To make Jellyfin trust the forwarded client address (used for LAN/remote detection and remote
  bitrate limits), add the Jellyplex container's IP or Docker subnet under
  *Dashboard → Networking → Known proxies*.
- HTTPS: put Jellyplex behind your usual reverse proxy (Traefik, Caddy, nginx, …) the same way
  you would any web app. In proxy mode, Jellyfin doesn't need to be exposed at all.
- The container serves a health check at `/healthz`.
- Jellyplex stores only its session token and UI preferences in the browser's local storage.

## Keyboard shortcuts (player)

| Key            | Action              |
| -------------- | ------------------- |
| `Space` / `K`  | Play / pause        |
| `←` / `J`      | Back 10 seconds     |
| `→` / `L`      | Forward 30 seconds  |
| `↑` / `↓`      | Volume              |
| `M`            | Mute                |
| `F`            | Full screen         |
| `N`            | Next item           |
| `P`            | Picture-in-picture  |
| `<` / `>`      | Slower / faster     |
| `Esc`          | Close menu / minimize to mini player |

`/` focuses search anywhere in the app.

## Development

Requires Node.js 20.19+ (22 or 24 recommended).

```bash
npm install
cp .env.example .env.local    # set JELLYFIN_URL to your server
npm run dev                   # http://localhost:5173, proxies /jellyfin to JELLYFIN_URL
npm run build                 # type-check and production build into dist/
```

Stack: React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, React Router and hls.js.
The Jellyfin API client is a thin typed `fetch` wrapper (`src/api/`).

```
src/
  api/          API client, types, image helpers, React Query hooks
  auth/         session handling
  components/   layout (top bar, sidebar, search), media cards and hubs, UI primitives
  pages/        home, library, item details, search, favorites, settings, admin/*
  player/       video player, device profile, music player, playback reporting
docker/         container entrypoint that writes config.js and the nginx site
```

## Compatibility and limitations

- Built and tested against Jellyfin 10.11. It only uses API endpoints that exist since 10.9, so
  10.9 and 10.10 should work as well, but they haven't been tested. Optional features degrade
  gracefully: storage stats need 10.11, Skip Intro needs 10.10+, and seek-bar previews only appear
  for videos with trickplay images.
- Server-side plugins work as usual. Plugins that modify the Jellyfin web UI have no effect in
  Jellyplex, and plugin settings pages open in the Jellyfin web UI.
- Not implemented: Live TV / DVR, SyncPlay, metadata and image editing, the photo slideshow
  (single-photo viewer only), and casting. Use the regular Jellyfin web UI for those.
- Which formats play directly depends on the browser. Jellyplex tells the server exactly what the
  current browser can decode, and the server transcodes everything else.

## Contributing

Bug reports, feature requests and pull requests are welcome.

- **Bugs:** open an issue and include your Jellyfin server version, the browser you use, and the steps
  to reproduce the problem. For playback problems, also say whether the player showed direct play
  or transcode, and include the media info for the file if you can.
- **Features:** open an issue to discuss larger changes before you start, so we can agree on the
  approach first.
- **Pull requests:**
  1. Fork the repository and create a branch from `main`.
  2. Set up the development environment as described under [Development](#development).
  3. Keep each pull request focused on one change, and follow the existing code style.
  4. Run `npm run build` before you submit. It type-checks the project and must pass.
  5. Describe what you changed and how you tested it. For UI changes, add a screenshot.

By submitting a contribution you agree that it is licensed under the GPLv2, the same license as the
rest of the project.

## Credits

The Jellyfin logo and colour scheme (purple `#AA5CC3` → blue `#00A4DC`) come from
[jellyfin/jellyfin-ux](https://github.com/jellyfin/jellyfin-ux). All copyright in that artwork belongs
to the Jellyfin contributors, and it is licensed under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Jellyplex is an unofficial client
and is not affiliated with or endorsed by the Jellyfin project.

## License

Jellyplex is licensed under the [GNU General Public License v2.0](LICENSE). The Jellyfin artwork
mentioned under [Credits](#credits) keeps its own CC BY-SA 4.0 license.
