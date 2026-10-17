# Changelog

Notable changes to Jellyfied. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/). The version you are running is
shown in the account menu and on the login screen.

## [Unreleased]

### Added
- Administrators can sign a user out of all their devices from Dashboard › Devices, which also
  ends their sessions. Signing yourself out this way keeps the device you are on.
- A server status button in the top bar for administrators, next to the dashboard and account
  buttons. It shows how many streams are playing, and opens a menu with what is playing across
  the whole server, running library scans and other tasks, and whether a newer Jellyfin or
  Jellyfied release is out (looked up on GitHub at most every six hours) or the server needs a
  restart.
- SyncPlay groups can be invite-only. Whoever creates a group picks whether everyone on the
  server can join it or only the users they choose. Invited users are asked in a popup whether to
  join, and others don't see the group in Jellyfied. Other Jellyfin apps still list every group.
- A picker for SyncPlay groups. Members suggest films, shows and episodes and vote on each other's
  suggestions (one vote each, never for their own). A wheel, where more votes make a bigger slice,
  spins once everyone is ready, or when the group's creator spins it, and what it picks starts
  for the whole group. Suggestions and votes are kept by the container (nginx with njs), which
  checks every request with Jellyfin.

### Changed
- The snowflake in the logo takes the accent colour chosen under Account settings.
- Works with Jellyfin 12. Jellyfin 12 no longer accepts the access token as "api_key" in addresses
  (unless its legacy authorization is turned back on), which broke the live connection (SyncPlay,
  remote control) and playing video and music. Jellyfied now sends it as "ApiKey", which Jellyfin
  10.11 accepts too. A photo's neighbours stay those of its own folder on Jellyfin 12.
- Dialogs are named by their title for screen readers.

### Fixed
- On iPhone and iPad, signing in left the app zoomed in, so it had to be pinched back out. Tapping
  a text field with text under 16px makes iOS zoom in; on touch screens text fields now use 16px.
- In a browser signed in from before the rename (as Jellyplex), creating or joining a SyncPlay
  group seemed to do nothing. Jellyfin puts such a browser's live connection in a session under the
  old name, so the app's requests under the new name made a second session that never heard about
  the group. The app now finds the name its live connection is filed under and uses it too.
- With Jellyfied open in more than one tab or window, creating or joining a SyncPlay group could
  seem to do nothing, and the group stayed in the list to join. Jellyfin counts the tabs of one
  browser as one member and tells only one of them about the group. The tabs now pass SyncPlay's
  messages on to each other, so every tab shows the group, and the tab where SyncPlay was last
  used is the one that plays along.
- The SyncPlay picker was missing for members whose sign-in uses another address for the same
  Jellyfin server, such as its direct address. The app now compares the servers' ids. In the
  player, the group's badge opens the picker, and the picker leaves full screen so it can be seen.

## [1.4.0] - 2026-10-16

### Added
- In the full-screen player, the title, show name, season and episode at the top are links:
  they open that film, show, season or episode page, and the video carries on in the mini player.

### Fixed
- Some HEVC videos stopped after the first few seconds in Firefox and kept buffering, while the
  whole video was downloaded in the background. These are files whose video the server copies
  into the stream as it is, encoded with "open GOP" (common for x265 releases), which Firefox
  can't play past the first part of. The player now notices this and has the server encode the
  video instead, from the same position.

## [1.3.1] - 2026-10-12

### Changed
- The descriptions of the project no longer compare it to other products.

### Removed
- Everything that still went by the project's former name: the old names of the environment
  variables are no longer read, and what a browser or the account stored under the old name
  is no longer carried over. Only the `JELLYFIED_` names work.

## [1.3.0] - 2026-10-12

### Changed
- The project has a new name, Jellyfied, and a logo of its own: a snowflake, in place of the
  Jellyfin logo. The repository is `CharlieGolfX/jellyfied`, the image
  `ghcr.io/charliegolfx/jellyfied`, and the environment variables start with `JELLYFIED_`.
- The screenshots in the README are retaken with the new name and logo, from a library of freely
  licensed and public-domain films instead of commercial ones.
- The "Jellyfin blue", "Jellyfin purple" and "Jellyfin dark" colours under Account settings are
  now named after Jellyfied. The colours are the same.
- Jellyfied is now licensed under the GNU General Public License, version 3 or later (it was
  version 2). Two of the libraries it ships with, hls.js and a part of the subtitle engine, can
  be combined with version 3 but not with version 2.

### Added
- `licenses.txt`, with the copyright notices and licences of everything Jellyfied ships with,
  linked from the login screen and the account menu.

## [1.2.0] - 2026-10-12

### Added
- VobSub (DVD) subtitles are drawn in the browser instead of being burned in by the server, so
  they no longer force a transcode and can be shifted with the subtitle delay. They are read out
  of the video file, which works for Matroska files whose index covers the subtitle track; the
  server still burns them in for other files.
- "Keep the styling of styled subtitles" under Account settings → Subtitle appearance. Switched
  off, ASS/SSA subtitles are shown as plain text in the size and colour you chose.
- Styled and image subtitles are shown in picture-in-picture and over AirPlay: while the picture
  is there, the server burns them into the video (Safari's picture-in-picture shows styled
  subtitles as plain text instead). Over AirPlay this goes for plain text subtitles too.
- A show or season sent to a Chromecast continues at the next episode to watch, from where it was
  left, instead of starting at the first episode.

- Spanish (Spain) and Norwegian Bokmål. The language follows the browser, or is chosen under
  Account settings → Language. A browser set to another kind of Spanish gets the Spanish text, and
  one set to plain Norwegian gets Bokmål.

### Changed
- Dates, numbers, file sizes and durations are written the way the chosen language writes them,
  not the way the browser's language does.
- Safari plays transcodes with its own HLS player, so hls.js (about 575 kB) is no longer fetched
  there. hls.js still takes over when an audio delay is set, which Safari's player can't apply,
  and when Safari's player fails on a stream.

### Fixed
- Plugins the server reports as "Superseded" are shown with a grey status, as the misspelt
  "Superceded" of older servers already was.
- Styled subtitles that can't be drawn in a browser are shown as plain text. They used to be
  burned into the video by the server, despite what the fallback was meant to do.

## [1.1.0] - 2026-10-12

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
  sign-in is stored encrypted with the PIN while another account is in use. On https and
  localhost the browser's own cryptography does this (PBKDF2 and AES-GCM), which makes guessing a
  PIN far slower; a PIN set earlier is moved over the next time it is entered.
- Server dashboard: Backups (create, list, restore), parental controls in the user editor
  (highest rating, unrated items, tags, access schedule), Branding, Metadata (date added, NFO
  files, chapter images, trickplay) and plugin repositories.
- The server's login disclaimer is shown on the sign-in screen.
- Preferences (colours, subtitle appearance, skip lengths, time display, home layout, remembered
  tracks) are saved with the Jellyfin account and follow you to other browsers.
- Live TV: channels with what is on, programmes airing now, and recordings.
- Photo slideshow.

- `JELLYFIED_BASE_PATH` serves Jellyfied under a path such as `/jellyfied`.

### Changed
- Menus follow their button while the page scrolls instead of closing.
- The container's nginx no longer runs as root, and is based on nginx 1.30. The default port is
  still 80; set `JELLYFIED_PORT=8080` on runtimes that do not let an unprivileged process use it.
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
  `JELLYFIED_TRUSTED_PROXIES` chooses which proxies are believed (default: private addresses).
- The device list in the server dashboard shows when each device was last active, and sorts by it.
- Files without a date no longer show "Jan 1, 1970" in the library list.

### Development
- Translations: all interface text (about 1,200 texts) is in one file per language under
  `src/i18n/locales/`, with typed keys, placeholders, plural forms and a language setting.
  Only English exists so far.
- The player's top bar and control bar are components of their own.
- Text keys that were made from the English sentence have short names that say what they are
  for (`admin.playback.vaapi`, not `admin.playback.videoAccelerationApiVaApi`).
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

First public version: library browsing, the video and music players, SyncPlay, playing on
other devices, the metadata editor and the server dashboard. See the
[README](README.md#features) for the full list.

### Added
- Prebuilt container images on GitHub Container Registry (`ghcr.io/charliegolfx/jellyfied`) for
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

[Unreleased]: https://github.com/CharlieGolfX/jellyfied/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/CharlieGolfX/jellyfied/compare/v1.3.1...v1.4.0
[1.3.1]: https://github.com/CharlieGolfX/jellyfied/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/CharlieGolfX/jellyfied/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/CharlieGolfX/jellyfied/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/CharlieGolfX/jellyfied/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/CharlieGolfX/jellyfied/releases/tag/v1.0.0
