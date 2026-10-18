# Development

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
and `JELLYFIED_DEV_PORT` to use a port other than 5173. It also answers the SyncPlay picker, with
the same code the container runs (`docker/syncplay-picker.js`), keeping its state in memory.

Stack: React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, React Router and hls.js.
The Jellyfin API client is a thin typed `fetch` wrapper (`src/api/`).

How to report bugs, propose changes and add translations is in
[CONTRIBUTING.md](../CONTRIBUTING.md).

## Project layout

```
src/
  api/          API client, types, image helpers, React Query hooks
  auth/         session handling
  components/   layout (top bar, sidebar, search), media cards and hubs, UI primitives
  i18n/         interface text, one file per language (see CONTRIBUTING.md)
  lib/          formatting, preferences and other shared helpers
  pages/        home, library, item details, search, favorites, settings, admin/*
  player/       video player, device profile, music player, playback reporting,
                SyncPlay, remote control
  player/video/ parts of the video player: stream handling, menus, shortcuts
  realtime/     WebSocket connection to the server
e2e/            browser tests
docker/         container entrypoint that writes config.js and the nginx site, SyncPlay picker
docs/           these pages and the README screenshots
scripts/        API type generation, screenshots, licence notices, release helpers
```

## Tests

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
- **Screenshots**: `scripts/screenshots.mjs` retakes the pictures in `docs/screenshots` from a
  real library; how to run it is at the top of the script. Use a library of freely licensed
  titles, as the current pictures do, not your own collection.

GitHub Actions runs all of this except the playback tests on every push and pull request, and
scans the container image for known vulnerabilities.

## Releasing

1. Set the new version in `package.json` (`npm version --no-git-tag-version 1.2.3`) and move the
   "Unreleased" entries in `CHANGELOG.md` under it.
2. Commit, then tag the commit `v1.2.3` and push the tag. The tag has to match `package.json`.

The "Container image" workflow then publishes `ghcr.io/charliegolfx/jellyfied` with that version
and `latest`, with a build provenance attestation and a bill of materials attached, and creates
the GitHub release from that version's changelog section. Every push to `main` publishes `edge`.
