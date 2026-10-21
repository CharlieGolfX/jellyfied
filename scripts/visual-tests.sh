#!/bin/sh
# Runs the screenshot tests (e2e/visual.spec.ts) in Playwright's Linux container, where the
# reference pictures are made, so they match on every machine. Extra arguments go to Playwright,
# e.g. --update-snapshots after an intended change to the player.
#
# The container gets its own node_modules (a Docker volume), so the one on this machine is left alone.
set -eu
VERSION=$(node -p "require('@playwright/test/package.json').version")
exec docker run --rm --ipc=host \
  -v "$PWD":/work -v jellyfied-visual-node-modules:/work/node_modules -w /work \
  -e E2E_VISUAL=1 -e E2E_BROWSERS=chromium -e CI \
  "mcr.microsoft.com/playwright:v${VERSION}-noble" \
  sh -c 'npm ci --no-audit --no-fund --loglevel=error && npx playwright test e2e/visual.spec.ts "$@"' sh "$@"
