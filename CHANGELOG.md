# Changelog

Notable changes to Jellyplex. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/). The version you are running is
shown in the account menu and on the login screen.

## [Unreleased]

### Added
- Chromecast: "Chromecast…" in the "Play on" menu, and a cast button in the player that moves the
  video you are watching to the TV. Works in Chrome, Edge and other Chromium browsers.
- AirPlay: an AirPlay button in the player in Safari.
- Styled subtitles (ASS/SSA) are drawn in the browser, with their fonts, colours, positions and
  effects, instead of being flattened to plain text.
- PGS image subtitles are drawn in the browser instead of being burned in by the server, so they
  no longer force a transcode and can be shifted with the subtitle delay.
- Transcodes use AV1 or HEVC when the browser decodes them and the server is allowed to encode
  them, and keep 5.1 sound when the sound output has the channels for it.
- Dolby Vision files with an HDR10, HLG or SDR fallback play directly instead of being transcoded.
- Touch controls in the player: tap to show or hide the controls, double-tap left or right to
  skip, double-tap the middle for full screen, swipe sideways to seek.
- Skip lengths can be chosen under Account settings (5 to 90 seconds, back and forward
  separately).
- `?` in the player lists the keyboard shortcuts; the list is also in the settings menu.
- The screen stays on while a video is playing, also in the mini player.

- Pages update on their own when the library changes or when something is watched, favourited or
  paused on another device.
- Library filters for year, age rating, resolution, tag and studio, and a list view next to the
  poster grid. Genre, year, rating, tag and studio take several values at once.
- An A–Z bar in libraries sorted by title. A letter moves the list there and keeps the rest of
  the library above and below it. Sorting, filters and the bar stay at the top while scrolling,
  and a filter chosen at a letter keeps the place in the alphabet.
- Large libraries stay light: only the rows near the screen are kept in the page.
- Posters are requested in the size the screen needs (smaller on phones, sharper on dense
  screens) and show a blurred preview while they load.
- Marking something watched or as a favourite shows at once, without waiting for the server.
- An item's page is fetched while the pointer rests on its card, so it opens without a wait.
- Going back returns to the same place in a list.
- Changing the poster size keeps your place in a list.
- Turning the mouse wheel over the volume control changes the volume, in the video player and
  the music bar.
- Long rows of search results and long track lists are put in the page as they are scrolled,
  not all at once.
- hls.js (about 575 kB) is fetched when a stream needs it, not with the player: files that play
  directly never load it.
- Selecting several items to mark them watched or unwatched, add them to a playlist or
  collection, or delete them. Shift-click selects everything in between.
- The home page has a featured title at the top, and "Customise home" to reorder (by dragging or
  with buttons) or hide its rows.
- Browser tabs and history entries are named after the page.
- Several accounts can be signed in on one device and switched between without a password. An
  account can be given a PIN that is asked for before switching to it on that device; its
  sign-in is stored encrypted with the PIN while another account is in use.
- Server dashboard: Backups (create, list, restore), parental controls in the user editor
  (highest rating, unrated items, tags, access schedule), Branding, Metadata (date added, NFO
  files, chapter images, trickplay) and plugin repositories.
- The server's login disclaimer is shown on the sign-in screen.
- Preferences (colours, subtitle appearance, skip lengths, time display, home layout, remembered
  tracks) are saved with the Jellyfin account and follow you to other browsers.
- Live TV: channels with what is on, programmes airing now, and recordings.
- Photo slideshow.

- `JELLYPLEX_BASE_PATH` serves Jellyplex under a path such as `/jellyplex`.

### Changed
- Menus follow their button while the page scrolls instead of closing.
- The container's nginx no longer runs as root, and is based on nginx 1.30. The default port is
  still 80; set `JELLYPLEX_PORT=8080` on runtimes that do not let an unprivileged process use it.
- The container's Content-Security-Policy now allows WebAssembly (for styled subtitles) and
  scripts from `www.gstatic.com` (Google's Cast software, loaded only when Chromecast is picked),
  and no longer allows inline styles.
- Build assets are compressed once at build time instead of on every request.

### Fixed
- Going from letter to letter in a library could leave the page on placeholders for a long time,
  mostly in Firefox: posters of lists that had already been left kept loading and held up the
  request for the new list. Images now stop loading when they leave the page, data is fetched
  ahead of artwork, and the titles above a letter load when you scroll up to them (or press
  "Earlier titles") instead of straight away.
- "Display language (server UI)" in the dashboard's General settings listed every language the
  server knows of. It now lists the languages the server's text has actually been translated to.
- Behind a reverse proxy or tunnel, Jellyfin was told the proxy's address instead of the
  visitor's, so the dashboard and activity log showed the same address for everyone. The
  container now works out the visitor's address from `X-Forwarded-For` and passes that on.
  `JELLYPLEX_TRUSTED_PROXIES` chooses which proxies are believed (default: private addresses).
- The device list in the server dashboard shows when each device was last active, and sorts by it.
- Files without a date no longer show "Jan 1, 1970" in the library list.

### Development
- Translations: all interface text (about 1,200 texts) is in one file per language under
  `src/i18n/locales/`, with typed keys, placeholders, plural forms and a language setting.
  Only English exists so far.
- The player's top bar and control bar are components of their own.
- Lint is free of warnings, with every rule an error; Prettier formats the code.
- Unit tests for the WebSocket client, SyncPlay, signing in and out, and what "Play" does; browser
  tests for search, settings, the dashboard and the metadata editor; all browser tests also run in
  Firefox and WebKit. Coverage is reported in CI.
- The container is tested in CI against a stand-in server (proxy, WebSocket, base path) and
  scanned for known vulnerabilities. Images carry provenance and a bill of materials.
- Actions are pinned to commits, Dependabot keeps dependencies current, and a version tag creates
  the GitHub release from the changelog.
- API types can be generated from the server's OpenAPI document and are checked against the
  hand-written ones.
- The library page, remote control, metadata editor and parts of the video player are split into
  smaller files.

## [1.0.0] - 2026-10-11

First public version: Plex-style browsing, the video and music players, SyncPlay, playing on
other devices, the metadata editor and the server dashboard. See the
[README](README.md#features) for the full list.

### Added
- Prebuilt container images on GitHub Container Registry (`ghcr.io/charliegolfx/jellyplex`) for
  amd64 and arm64: `latest` and version tags for releases, `edge` for the main branch.
- The version is shown in the account menu and on the login screen.
- A page that runs into an error no longer blanks the whole app: the page shows a message with
  "Try again" and "Reload", and the sidebar, search and players keep working. The same goes for the
  video player, which is stopped without taking the page you are browsing with it. After an update,
  a page that belongs to the old version asks for a reload instead of failing.

### Development
- Unit tests (Vitest), browser tests (Playwright) and linting (oxlint), run by `npm run check`
  and `npm run test:e2e`, and on every push and pull request by GitHub Actions.
- The video player is split into smaller parts under `src/player/video/`.

[Unreleased]: https://github.com/CharlieGolfX/jellyplex/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/CharlieGolfX/jellyplex/releases/tag/v1.0.0
