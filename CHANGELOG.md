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
- Library filters for year, age rating, resolution, tag and studio, an A–Z bar to jump to a
  letter, and a list view next to the poster grid.
- Selecting several items to mark them watched or unwatched, add them to a playlist or
  collection, or delete them.
- The home page has a featured title at the top, and "Customise home" to reorder or hide its rows.
- Browser tabs and history entries are named after the page.
- Several accounts can be signed in on one device and switched between without a password.
- Preferences (colours, subtitle appearance, skip lengths, time display, home layout, remembered
  tracks) are saved with the Jellyfin account and follow you to other browsers.
- Live TV: channels with what is on, programmes airing now, and recordings.
- Photo slideshow.

### Changed
- The container's Content-Security-Policy now allows WebAssembly (for styled subtitles) and
  scripts from `www.gstatic.com` (Google's Cast software, loaded only when Chromecast is picked).

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
