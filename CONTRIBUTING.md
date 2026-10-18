# Contributing to Jellyfied

Bug reports, feature requests, translations and pull requests are welcome. Security problems are
reported privately; see [SECURITY.md](SECURITY.md).

## Reporting bugs

Open an issue and include your Jellyfied version (shown in the account menu), your Jellyfin server
version, the browser you use, and the steps to reproduce the problem. For playback problems, also
say whether the player showed direct play or transcode, and include the media info for the file if
you can.

## Suggesting features

Open an issue to discuss larger changes before you start, so we can agree on the approach first.
Check [the known limitations](docs/compatibility.md) first: some of them are on purpose.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Set up the development environment as described in [docs/development.md](docs/development.md).
3. Keep each pull request focused on one change, and follow the existing code style.
4. Run the checks before you submit. All of them must pass, and new logic should come with a test:

   ```bash
   npm run check            # lint, formatting, type-check and unit tests
   npm run build            # production build
   npm run test:e2e         # browser tests against a mocked server (first run: npx playwright install)
   npm run test:container   # only when you changed docker/ or the Dockerfile (needs Docker)
   ```

5. Add a line under "Unreleased" in `CHANGELOG.md` for anything users will notice.
6. Describe what you changed and how you tested it. For UI changes, add a screenshot.

GitHub Actions runs the same checks on every pull request, in Chromium, Firefox and WebKit.

## Translations

Jellyfied comes in English, Spanish (Spain) and Norwegian Bokmål. The Spanish and Norwegian texts
were translated by machine and have not yet been read through by a native speaker, so
corrections are especially welcome: a pull request that changes only `src/i18n/locales/es-ES.json`
or `nb.json` is fine, and so is an issue that lists the texts that read wrong, with where in the app
they appear. Keep the `{placeholders}` as they are; the unit tests check that every language has
the same texts and placeholders as English.

### Adding a language

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

### Texts in the code

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

## License of contributions

By submitting a contribution you agree that it is licensed under the GNU General Public License,
version 3 or later, the same license as the rest of the project.
