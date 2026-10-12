# Jellyfied

> [!NOTE]
> **This project is built entirely by AI.** All of the code, tests and documentation were written
> by an AI coding assistant, directed by the maintainer.
> No part of it was written by hand. Keep that in mind when you decide whether to run it, and
> please report anything that looks wrong.

A web frontend for an existing [Jellyfin](https://jellyfin.org) server, with a layout modelled on Plex
and a full server dashboard for administrators. It runs as a
small nginx container. Your Jellyfin server is not modified: Jellyfied is just another client.

Jellyfied was called Jellyplex up to version 1.2.0. See [Coming from Jellyplex](#coming-from-jellyplex)
if you are updating an older install.

![Home page with the featured title and Continue Watching](docs/screenshots/home.jpg)

## Contents

- [Screenshots](#screenshots)
- [Features](#features)
- [Installation](#installation)
  - [Prebuilt image](#prebuilt-image)
  - [Docker Compose](#docker-compose)
  - [Building with Docker, without Compose](#building-with-docker-without-compose)
  - [Static hosting without Docker](#static-hosting-without-docker)
- [Configuration](#configuration)
  - [Notes](#notes)
  - [Coming from Jellyplex](#coming-from-jellyplex)
- [Keyboard shortcuts (player)](#keyboard-shortcuts-player)
- [Development](#development)
  - [Translations](#translations)
  - [Tests](#tests)
  - [Releasing](#releasing)
- [Compatibility and limitations](#compatibility-and-limitations)
- [Contributing](#contributing)
- [Credits](#credits)
- [License](#license)

## Screenshots

| Player | Library, Recommended tab |
| --- | --- |
| ![Video player with its controls and the settings menu](docs/screenshots/player.jpg) | ![Movies library, Recommended tab](docs/screenshots/movies-recommended.jpg) |

| Library grid | Library list, with items selected |
| --- | --- |
| ![Movies library grid with sorting, filters and the A–Z bar](docs/screenshots/movies-library.jpg) | ![Movies library as a list, with three items selected and the bulk actions](docs/screenshots/library-list.jpg) |

| Movie details | Show details |
| --- | --- |
| ![Movie detail page with cast and media info](docs/screenshots/movie-details.jpg) | ![Show detail page with seasons](docs/screenshots/show-details.jpg) |

| Account settings |  |
| --- | --- |
| ![Account and playback settings](docs/screenshots/account-settings.png) |  |

The library in these pictures is made up of freely licensed and public-domain titles: the Blender
Studio open movies (Tears of Steel, Sintel, Big Buck Bunny, Cosmos Laundromat and others,
CC BY), Sita Sings the Blues (CC0), Pioneer One (CC BY-NC-SA) and silent films from before 1929.
The posters and descriptions are what the Jellyfin server fetched for them from
[TMDB](https://www.themoviedb.org); they belong to their owners.

## Features

**Browsing (Plex layout)**
- Top bar with global search (type `/` to focus) and live results, collapsible library sidebar, account menu.
- Drag libraries in the sidebar to reorder them. The order is saved to your Jellyfin account, so it
  also applies to the home page and other Jellyfin apps.
- Home: a featured title at the top, Continue Watching (in-progress plus next-up episodes merged,
  like Plex's On Deck), Continue Listening, and Recently Added per library. "Customise home" at the
  bottom of the page reorders (drag, or the arrow buttons) or hides the rows and the featured title.
- Libraries with Plex-style tabs: Recommended / Library / Collections / Categories for movies and TV,
  Albums / Artists / Genres for music, and folder browsing for home videos, photos, books and mixed libraries.
  Sorting, infinite scroll, and filters for watched state, favorites, genre, year, age rating,
  resolution (4K / HD / SD), tag and studio. Genre, year, rating, tag and studio take several
  values at once (any of them matches).
- An A–Z bar in libraries sorted by title: a letter moves the list there, with the rest of the
  library still above and below it (the titles before it load when you scroll up). Sorting,
  filters and the A–Z bar stay at the top of the page while you scroll. A list view as a denser
  alternative to the poster grid.
- Built for large libraries: only the rows near the screen are kept in the page, posters are
  requested in the size the screen needs and show a blurred preview until they arrive, an
  item's page is fetched while the pointer rests on its card, and going back, or changing the
  poster size, returns to where you were in a list.
- Select several items (the tick on a card or row; shift-click for everything in between) to mark
  them watched or unwatched, add them to a playlist or collection, or delete them in one go.
- Pages update on their own: new media after a library scan, and watched state, favorites and
  resume positions changed on your other devices, appear without a reload.
- Live TV: the channels with what is on, what is airing now, and your recordings.
- Photo slideshow, from a photo folder or from any photo (`Space` starts and pauses it).
- Adjustable poster size on every page (top-bar zoom button, or the slider in library views). The
  setting applies to every row and grid and is remembered.
- Detail pages for movies, shows, seasons, episodes, albums, artists, playlists, collections, people,
  genres and studios. Backdrop hero, ratings, cast & crew, extras, trailers, "More Like This", and
  version/audio/subtitle pickers.
- Shuffle button on folder-based libraries and folder pages. It plays everything below the folder,
  including subfolders.
- Unwatched corner badges, progress bars, watched toggles and favorites everywhere.
- "Remove from Continue Watching" in the menu of anything you have started, to clear its resume
  position.
- Add movies, shows and videos to a collection (new or existing) from their menu, and remove them
  again on the collection's page. Needs administrator rights or the collection-management permission.
- Playlists: "Add to playlist" in the menu of songs, albums, artists, movies, shows and episodes
  (to a new or an existing playlist). On a playlist's page, drag entries into another order, remove
  them, rename the playlist, or make it visible to all users.

**Playback**
- Video player that plays files directly when the browser supports them and lets the server
  transcode when it doesn't, switching over automatically if direct play fails. Transcodes use
  AV1 or HEVC where the browser decodes them and the server is allowed to encode them, and H.264
  otherwise, with 5.1 sound when the output has the channels for it.
- HDR and Dolby Vision files with an HDR10, HLG or SDR fallback play directly on screens that can
  show them.
- Audio track, subtitle, quality and playback speed (0.5×–2×) switching. Text subtitles
  (SRT/ASS/VTT, embedded or sidecar) and image subtitles (PGS/VobSub) are both supported.
- Styled subtitles (ASS/SSA) are drawn in the browser with their own fonts, colours, positions
  and effects, and PGS and VobSub (DVD) image subtitles are drawn in the browser too, so none of
  them makes the server re-encode the video.
- Resume, chapter markers and a chapter list to jump from, thumbnail previews on the seek bar
  (when the server has generated trickplay images), Skip Intro / Credits (when the server has
  media segments), Up Next with auto-play (honours the user's preference), keyboard shortcuts.
- Subtitle delay (earlier or later in 0.1 s steps) for every subtitle the browser draws, and
  subtitle appearance (size, colour, background, edge) for plain text subtitles. A switch under
  Account settings shows styled subtitles as plain text too, in the size and colour you chose.
- Touch controls: tap to show or hide the controls, double-tap the left or right side to skip,
  double-tap the middle for full screen, and swipe sideways to seek.
- Skip lengths of your choice (5 to 90 seconds, separately for back and forward), and a list of
  the keyboard shortcuts on `?`.
- Audio delay, to hold the sound back by up to 3 seconds when it is ahead of the picture. Both
  delays have a slider and step buttons in the player menus, as well as keyboard shortcuts.
- Aspect ratio and zoom: fit, fill (crop) or stretch the picture, force 16:9, 4:3, 21:9 or
  2.39:1, and zoom in up to 200%.
- Remembers the audio and subtitle track you pick for a show and uses it for the following
  episodes, matching by language and title, so it also works when episodes number their tracks
  differently. Follows the "Remember audio/subtitle selections" account settings.
- Playback info overlay ("stats for nerds"): play method, why the server is transcoding and what
  the transcoder is doing, source and player resolution, codecs, buffer and dropped frames.
- Sleep timer: pause after 15 to 120 minutes, or stop at the end of the current video.
- "Ends at" clock in the player controls, showing when the video will finish at the current
  playback speed.
- Picture-in-picture, from the player or the mini player, plus OS media controls (media keys,
  lock screen) for video.
- SyncPlay: create or join a group from the top bar and watch together. Play, pause, seek and
  moving on to the next episode apply to everyone, and playback is kept in step across devices.
- Play on another device: pick any Jellyfin app that supports remote control (TV apps, another
  browser tab, …) from the top bar, and what you play is sent there, with a remote-control bar for
  pause, seek, volume and stop. Jellyfied tabs can be controlled the same way from other apps.
- Chromecast (Chrome, Edge and other Chromium browsers): pick "Chromecast…" in the same menu, or
  the cast button in the player to move the video you are watching to the TV.
- AirPlay (Safari): the AirPlay button in the player sends the video to an Apple TV or another
  AirPlay device.
- Mini player: press Back (or `Esc`) in the player and the video keeps playing in a small window,
  so you can browse and read media info while streaming. Click it to expand, or use its controls to
  pause or stop. Starting music pauses the video.
- Persistent music player bar with queue, shuffle, repeat and OS media keys.
- Instant Mix: start a queue of similar music from any song, album, artist, genre or playlist.
- Playback progress and watched state are synced with Jellyfin, so you can continue on any other
  Jellyfin app.

**Server dashboard (administrators)**
- Dashboard: active streams with transcode details and remote pause/stop/message, active devices,
  library counts, storage, running tasks, recent activity, scan/restart/shutdown.
- General settings, Users (create, delete, permissions, library access, passwords, and parental
  controls: highest allowed rating, unrated items, allowed and blocked tags, access schedule),
  Libraries (add with a server-side folder browser, rename, add/remove folders, scan, refresh metadata, remove),
  Transcoding (hardware acceleration, encoder settings, throttling, resume thresholds),
  Metadata (date added, NFO files, chapter images, trickplay), Networking, Branding (login
  disclaimer, and custom CSS and splash screen for Jellyfin's own web interface), Scheduled Tasks,
  Activity log, Devices, Plugins (installed, catalog and repositories, with a Configure link that
  opens the plugin's settings page in the Jellyfin web UI), Backups (create, list, restore),
  API keys and a Log viewer.
- Metadata editor ("Edit metadata" in an item's menu): titles, overview, dates, ratings, genres,
  tags, studios and external IDs; upload, delete or find artwork online; and Identify to match an
  item against the server's metadata providers again.

**Account**
- Quick Connect sign-in and authorization, profile picture, password, playback language and subtitle
  preferences, streaming quality per device, time display (24-hour by default, or 12-hour),
  subtitle appearance and interface colours (accent colour, from presets or any colour you pick,
  and background tone).
- Several accounts on one device: "Add another account" in the account menu keeps the current one
  signed in, and you switch between them from the same menu or the sign-in screen without typing
  a password again. An account can be given a PIN (Account settings) that is asked for before
  anyone switches to it on that device; while another account is in use, its sign-in is stored
  encrypted with that PIN.
- Your preferences follow your account: colours, subtitle appearance, skip lengths, time display,
  the home page layout and the tracks remembered per show are the same in every browser you sign
  in to. This can be switched off under Account settings.

## Installation

Jellyfied needs a running Jellyfin server (10.9 or newer, 10.11 recommended) and Docker. You can
run the [prebuilt image](#prebuilt-image) or build the container from source with
[Docker Compose](#docker-compose).

### Prebuilt image

Images for amd64 and arm64 are published to the GitHub Container Registry:

```bash
docker run -d --name jellyfied -p 8080:80 \
  -e JELLYFIN_URL=http://192.168.1.10:8096 \
  --restart unless-stopped ghcr.io/charliegolfx/jellyfied:latest
```

Set `JELLYFIN_URL` to your Jellyfin server as reachable from inside the container (see the table
under [Docker Compose](#docker-compose)), then open `http://localhost:8080`.

| Tag      | Contents |
| -------- | -------- |
| `latest` | The newest release. |
| `1.2.3`, `1.2`, `1` | A specific release, or the newest one within that version line. |
| `edge`   | The current `main` branch. |

To update, pull the image again and recreate the container. What changed in each release is in
the [changelog](CHANGELOG.md).

### Docker Compose

This builds the container from source.

1. Clone the repository:

   ```bash
   git clone https://github.com/CharlieGolfX/jellyfied.git
   cd jellyfied
   ```

2. Tell Jellyfied where your Jellyfin server is. The default is a Jellyfin server on the Docker
   host, port 8096; if that is your setup, skip this step. Otherwise create a `.env` file from the
   example and set `JELLYFIN_URL` in it, to the address as reachable from inside the Jellyfied
   container:

   ```bash
   cp .env.example .env
   ```

   | Where Jellyfin runs                    | `JELLYFIN_URL`                                                         |
   | -------------------------------------- | ---------------------------------------------------------------------- |
   | Same Docker network / compose project  | `http://jellyfin:8096`                                                 |
   | On the Docker host                     | `http://host.docker.internal:8096`                                     |
   | Another machine                        | `http://192.168.1.10:8096`                                             |
   | Behind a base URL                      | `http://jellyfin:8096/jellyfin`                                        |

3. Build and start the container:

   ```bash
   docker compose up -d --build
   ```

4. Open `http://localhost:8080` and sign in with your Jellyfin account.

The port and the other settings are described under [Configuration](#configuration).

To update later, pull the latest changes and rebuild:

```bash
git pull
docker compose up -d --build
```

### Building with Docker, without Compose

```bash
git clone https://github.com/CharlieGolfX/jellyfied.git
cd jellyfied
docker build -t jellyfied .
docker run -d --name jellyfied -p 8080:80 \
  -e JELLYFIN_URL=http://192.168.1.10:8096 \
  --restart unless-stopped jellyfied
```

### Static hosting without Docker

`npm run build` produces a static site in `dist/`. Serve it with any web server that falls back to
`index.html` for unknown paths, and edit `dist/config.js` to point `serverUrl` at your Jellyfin
server. In this mode the browser talks to Jellyfin directly, which works because Jellyfin allows
cross-origin requests by default.

## Configuration

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

¹ The Compose file sets it to `http://host.docker.internal:8096` unless you choose another value.

If neither URL is set, the login screen asks for the server address. Jellyfin allows cross-origin
requests by default, so this works without a proxy too.

Docker Compose additionally understands these:

| Variable                 | Default    | Description |
| ------------------------ | ---------- | ----------- |
| `JELLYFIED_HOST_PORT`    | `8080`     | Port Jellyfied is reachable on. |
| `JELLYFIED_BIND_ADDRESS` | `0.0.0.0`  | Address the port is published on. Use `127.0.0.1` to make Jellyfied reachable from the Docker host only, for example when a reverse proxy runs in front of it. |

### Notes

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
- HTTPS: put Jellyfied behind your usual reverse proxy (Traefik, Caddy, nginx, …) the same way
  you would any web app. In proxy mode, Jellyfin doesn't need to be exposed at all.
- The container serves a health check at `/healthz`.
- nginx runs as an unprivileged user (uid 101), not as root. Docker lets it listen on port 80
  anyway; on runtimes that don't (some Kubernetes and rootless setups), set `JELLYFIED_PORT=8080`
  and publish that port instead.
- The container sends a strict Content-Security-Policy: scripts and styles only from Jellyfied
  itself, plus WebAssembly (for styled subtitles) and Google's Cast script when Chromecast is used.
- Under a base path, a reverse proxy in front has to pass the path on unchanged (no stripping).
- Jellyfied stores only the session tokens of the signed-in accounts and UI preferences in the
  browser's local storage.

### Coming from Jellyplex

Jellyfied was called Jellyplex up to version 1.2.0. An existing install keeps working:

- **Image:** new versions are published as `ghcr.io/charliegolfx/jellyfied`. The old
  `ghcr.io/charliegolfx/jellyplex` image stays where it is but gets no more updates, so change the
  image name to keep receiving them.
- **Environment variables:** the `JELLYPLEX_…` names are still read where the matching
  `JELLYFIED_…` one is not set, both by the container and by `docker-compose.yml`.
- **Browsers:** sign-ins and settings saved under the old name are moved over the first time the
  new version is opened, and settings synced to the Jellyfin account are carried over too.
- **Compose:** the service and container are now called `jellyfied`. After pulling the new
  `docker-compose.yml`, run `docker compose up -d --remove-orphans` once to replace the old
  container.
- **Base path:** if you serve it under `/jellyplex`, that path keeps working for as long as you
  leave the setting as it is.

## Keyboard shortcuts (player)

| Key            | Action              |
| -------------- | ------------------- |
| `Space` / `K`  | Play / pause        |
| `←` / `J`      | Back 10 seconds ¹   |
| `→` / `L`      | Forward 30 seconds ¹ |
| `↑` / `↓`      | Volume (also: turn the mouse wheel over the volume control) |
| `M`            | Mute                |
| `F`            | Full screen         |
| `N`            | Next item           |
| `P`            | Picture-in-picture  |
| `<` / `>`      | Slower / faster     |
| `G` / `H`      | Subtitles earlier / later |
| `Z` / `X`      | Less / more audio delay |
| `I`            | Playback info       |
| `?`            | Show this list in the player |
| `Esc`          | Close menu / minimize to mini player |

¹ Or the lengths chosen under *Account settings → This device*.

`/` focuses search anywhere in the app.

## Development

Requires Node.js 22.22+ (24 recommended).

```bash
npm install
cp .env.example .env          # set JELLYFIN_URL to your Jellyfin server
npm run dev                   # http://localhost:5173
npm run build                 # type-check and production build into dist/
npm run check                 # lint, formatting, type-check and unit tests
npm run format                # format everything with Prettier
npm run test:e2e              # browser tests (first run: npx playwright install)
npm run test:container        # build the image and test what it serves (needs Docker)
```

The development server proxies `/jellyfin` to `JELLYFIN_URL`, like the container does. Set
`JELLYFIN_DEV_URL` if your machine reaches Jellyfin at a different address than the container,
and `JELLYFIED_DEV_PORT` to use a port other than 5173.

Stack: React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, React Router and hls.js.
The Jellyfin API client is a thin typed `fetch` wrapper (`src/api/`).

### Translations

Interface text is not written in the components. It lives in one file per language under
`src/i18n/locales/`; English (`en.json`) is the reference and the fallback.

```tsx
import { t, tRich } from '@/i18n';

<Button>{t('login.signIn')}</Button>
t('userMenu.switchTo', { name })                  // "Switch to {name}"
t('settings.seconds', { count })                  // { "one": "…", "other": "…" } picks the plural form
tRich('admin.userEdit.deleteConfirm', { name: <strong>{user.Name}</strong> })   // an element inside a sentence
```

- Keys are checked by TypeScript against `en.json`, so a misspelt key fails the type check.
- Texts are grouped by where they are used (`admin.backups.…`, `player.…`); texts used in several
  places are under `common`. Counted things ("3 items") are under `count` and go through
  `plural()` in `lib/format`.
- The language is loaded before the app starts, and changing it reloads the page. `t` can
  therefore be called anywhere, including where a module defines its constants.
- Keep sentences whole. A sentence glued together from translated pieces cannot be reordered by
  a language with another word order; use placeholders, or `tRich` when a piece is an element.
- Not translated on purpose: messages for developers (`useAuth must be used inside AuthProvider`)
  and product names.

Jellyfied comes in English, Spanish (Spain, `es-ES.json`) and Norwegian Bokmål (`nb.json`). To
add a language, add `src/i18n/locales/<code>.json` (for example `de.json` or `pt-BR.json`). It
then appears under Account settings → Language by itself, is loaded only when chosen, and is
picked automatically for browsers set to that language; a language that only exists for another
region is used too (`es-MX` gets `es-ES`). A text that is missing falls back to English while
the app runs, but a unit test asks every language file to have every text English has, with the
same placeholders and the plural forms its language needs: a new English text needs its
translations in the same change.

Dates, numbers, sizes and durations are written the way the chosen language writes them
(`lib/format` takes the language from `src/i18n`), not the way the browser's language does.

### Tests

- **Unit tests** ([Vitest](https://vitest.dev)) live next to the code as `*.test.ts(x)`. `npm test`
  runs them once, `npm run test:watch` re-runs them as you edit.
- `npm run test:coverage` also writes a coverage report to `coverage/`, and fails when coverage
  drops below the floor set in `vite.config.ts` (CI runs this). Raise the floor when you add tests.
- Hooks are tested by running them in a component (`src/test/renderHook.tsx`), with the server
  and the browser's media abilities replaced by stand-ins.
- **Browser tests** ([Playwright](https://playwright.dev)) are in `e2e/`. `npm run test:e2e` builds
  the site and runs `smoke.spec.ts` and `pages.spec.ts` against a mocked Jellyfin API, so no server
  is needed. They run in Chromium, Firefox and WebKit (Safari's engine); `E2E_BROWSERS=chromium`
  limits a run to one of them.
- **Playback tests** (`e2e/live.spec.ts`) play real media and are skipped unless you give them a
  test account. They change the watched state of what they play, so use a throwaway user:

  ```bash
  E2E_USERNAME=test E2E_PASSWORD=secret E2E_JELLYFIN_URL=http://localhost:8096 npm run test:e2e
  ```

  Add `E2E_BASE_URL=http://localhost:8080` to test a running container instead of a fresh build.
- **Container tests** (`docker/test-container.mjs`) start the image against a stand-in server and
  check the site, the security headers, the reverse proxy including WebSockets, and serving under
  a base path.
- **Linting** uses [oxlint](https://oxc.rs/docs/guide/usage/linter) (`npm run lint`), including the
  React hooks and React compiler rules, all as errors. **Formatting** is
  [Prettier](https://prettier.io) (`npm run format`).
- **API types**: `npm run generate:api` regenerates `src/api/generated.ts` from a Jellyfin
  server's OpenAPI document. The types the app uses (`src/api/types.ts`) are cut out of those:
  each lists its fields and takes their types from the generated ones, apart from the few it
  describes more exactly. A field the server does not have, or a type the server's description
  rules out, fails the type check.
- **Screenshots**: `scripts/screenshots.mjs` retakes the pictures in this README from a real library.
  Use one with freely licensed titles, as the current pictures do, not your own collection.

GitHub Actions runs all of this except the playback tests on every push and pull request, and
scans the container image for known vulnerabilities.

### Releasing

1. Set the new version in `package.json` (`npm version --no-git-tag-version 1.2.3`) and move the
   "Unreleased" entries in `CHANGELOG.md` under it.
2. Commit, then tag the commit `v1.2.3` and push the tag. The tag has to match `package.json`.

The "Container image" workflow then publishes `ghcr.io/charliegolfx/jellyfied` with that version
and `latest`, with a build provenance attestation and a bill of materials attached, and creates
the GitHub release from that version's changelog section. Every push to `main` publishes `edge`.

```
src/
  api/          API client, types, image helpers, React Query hooks
  auth/         session handling
  components/   layout (top bar, sidebar, search), media cards and hubs, UI primitives
  pages/        home, library, item details, search, favorites, settings, admin/*
  player/       video player, device profile, music player, playback reporting,
                SyncPlay, remote control
  player/video/ parts of the video player: stream handling, menus, shortcuts
  realtime/     WebSocket connection to the server
e2e/            browser tests
docker/         container entrypoint that writes config.js and the nginx site
```

## Compatibility and limitations

- Jellyfin 10.11 is recommended and is what Jellyfied is tested against. Jellyfin 10.9 and 10.10
  are expected to work, with a few features unavailable: storage statistics need 10.11 and Skip
  Intro needs 10.10 or newer. Seek-bar previews only appear for videos with trickplay images.
- Server-side plugins work as usual. Plugins that modify the Jellyfin web UI have no effect in
  Jellyfied, and plugin settings pages open in the Jellyfin web UI.
- Live TV covers watching channels and recordings. The programme guide grid, and scheduling or
  cancelling recordings (DVR), are not implemented; use the regular Jellyfin web UI for those.
- Every account signed in on a device can be switched to from that device without a password,
  like in other apps with an account switcher, unless it has a PIN. With a PIN, the account's
  sign-in is stored encrypted while someone else uses the browser. Two limits: the account that
  is in use at the moment is not protected by its PIN, and a short PIN can be found by a program
  that tries every combination against the stored data (each try is slowed down, most of all on
  https and localhost, where the browser's own cryptography is used; every extra digit makes it
  ten times as long). On a shared device with people you don't trust, sign out
  instead. Signing in with the password again removes the PIN, and an account whose PIN is
  forgotten can only be removed from the device, not signed out on the server from there.
- The login disclaimer is shown as plain text; HTML in it is not rendered.
- "Play on another device" works with apps that are signed in to your Jellyfin server and accept
  remote control.
- Chromecast uses Jellyfin's own receiver app, which fetches the media from your server itself.
  The Chromecast therefore has to be able to open the address you use for Jellyfied: it does not
  work when you browse on `localhost`, and a server behind HTTPS needs a certificate the Chromecast
  trusts. The Cast software is loaded from Google (`www.gstatic.com`) the first time you pick
  Chromecast, and not before. A show or season continues at the next episode to watch, as it
  does in the browser; albums and playlists start from their beginning.
- AirPlay shows the video and plays its sound on the other device. It only carries the picture,
  so while it is in use the server burns the subtitles into the video, which means a transcode.
  The address you use for Jellyfied has to be reachable from the AirPlay device.
- HEVC and AV1 transcoding has to be switched on in the server: *Dashboard → Playback →
  Transcoding → Allow encoding in HEVC format / AV1 format*. Without it the server transcodes to
  H.264 as before. Files that are already HEVC or AV1 are passed through either way.
- SyncPlay covers video. Music played while in a group stays on your own device.
- Subtitle appearance applies to plain text subtitles. Styled (ASS/SSA) subtitles keep the look
  their author gave them unless you switch that off under Account settings, and PGS and VobSub
  subtitles are pictures.
- VobSub (DVD) subtitles are read out of the video file itself, because the server has no way to
  hand them out. That works for Matroska (MKV) files whose index covers the subtitle track, which
  MKVToolNix and ffmpeg write. For other files, and for VobSub in a file of its own (.idx/.sub),
  the server burns them into the video as before and they can't be shifted.
- A picture-in-picture window only shows the picture. While it is open, the server burns image
  subtitles into the video, and in Chromium browsers styled subtitles too; Safari shows styled
  subtitles as plain text there. This restarts the stream when the window opens and closes.
- Audio delay can only make the sound later, not earlier: a browser can't play sound ahead of the
  picture. It is not available in Safari on iPhone and iPad.
- Streaming quality, poster size, grid or list view and volume are stored per browser. The other
  preferences are saved with your Jellyfin account, where only Jellyfied reads them.
- SyncPlay and remote control use a WebSocket connection. If you put another reverse proxy in front
  of Jellyfied, make sure it forwards WebSocket upgrades.
- Which formats play directly depends on the browser. Jellyfied tells the server exactly what the
  current browser can decode, and the server transcodes everything else.

## Contributing

Bug reports, feature requests and pull requests are welcome. Security problems are reported
privately; see [SECURITY.md](SECURITY.md).

- **Bugs:** open an issue and include your Jellyfied version (shown in the account menu), your
  Jellyfin server version, the browser you use, and the steps
  to reproduce the problem. For playback problems, also say whether the player showed direct play
  or transcode, and include the media info for the file if you can.
- **Features:** open an issue to discuss larger changes before you start, so we can agree on the
  approach first.
- **Pull requests:**
  1. Fork the repository and create a branch from `main`.
  2. Set up the development environment as described under [Development](#development).
  3. Keep each pull request focused on one change, and follow the existing code style.
  4. Run `npm run check` and `npm run build` before you submit. Both must pass, and new logic
     should come with a test.
  5. Describe what you changed and how you tested it. For UI changes, add a screenshot.

By submitting a contribution you agree that it is licensed under the GNU General Public License,
version 3 or later, the same license as the
rest of the project.

## Credits

Jellyfied is an unofficial client. It is not affiliated with or endorsed by the Jellyfin project
or by Plex, Inc.; Jellyfin, Plex, Chromecast and AirPlay are trademarks of their owners.

Jellyfied is built on React, TanStack Query, React Router, hls.js, JASSUB (libass), libpgs and
Lucide, among others. Every build writes `licenses.txt` next to the site, with the copyright
notices and licence texts of everything it ships; the app links to it from the login screen and
the account menu, and `node scripts/third-party-notices.mjs` prints it.

## License

Copyright (C) 2026 CharlieGolfX.

Jellyfied is free software: you can redistribute it and/or modify it under the terms of the
[GNU General Public License](LICENSE) as published by the Free Software Foundation, either
version 3 of the License, or (at your option) any later version. It comes without any warranty.
Versions up to 1.2.0 were released under version 2 of that license.

The libraries Jellyfied ships with keep their own licenses (see `licenses.txt`). Some of them (hls.js under
the Apache License 2.0, and a part of the subtitle engine under the GPL version 3) can be
combined with version 3 of the GPL but not with version 2, which is why Jellyfied moved to it.

The container image is the Jellyfied site on top of the
[nginx-unprivileged](https://github.com/nginx/docker-nginx-unprivileged) image, which contains
nginx and Alpine Linux packages under their own licenses; their source is available from those
projects. The `licenses` label on the image describes Jellyfied itself.
