// Builds the text of licenses.txt: Jellyfied's own licence, and the copyright notices and licences
// of everything that is shipped with it. The build writes it next to the site (see vite.config.ts),
// and the app links to it from the login screen and the account menu.
//   node scripts/third-party-notices.mjs      prints it
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const licence = (id) => read(`licenses/${id}.txt`).trim();
const RULE = '='.repeat(78);
const section = (title, body) => `${RULE}\n${title}\n${RULE}\n\n${body.trim()}\n`;

/**
 * What the styled-subtitle engine (JASSUB's WebAssembly file) is built from, by JASSUB's own
 * account of its licences. These are compiled in, so npm does not list them.
 */
const INSIDE_JASSUB = [
  ['libass', 'ISC', 'https://github.com/libass/libass'],
  ['FreeType', 'FTL', 'https://freetype.org'],
  ['FriBidi', 'LGPL-2.1-or-later', 'https://github.com/fribidi/fribidi'],
  ['HarfBuzz', 'MIT-Modern-Variant', 'https://github.com/harfbuzz/harfbuzz'],
  ['Brotli', 'MIT', 'https://github.com/google/brotli'],
];
/** Licences JASSUB names for the rest of what it compiles in, printed in full below. */
const JASSUB_LICENCES = ['ISC', 'FTL', 'LGPL-2.1-or-later', 'MIT-Modern-Variant', 'NTP', 'Zlib', 'BSL-1.0'];

/** The packages that end up in the site: everything package-lock.json does not mark as development-only. */
function shippedPackages() {
  const lock = JSON.parse(read('package-lock.json'));
  return Object.entries(lock.packages)
    .filter(([path, info]) => path.startsWith('node_modules/') && !info.dev && !info.devOptional)
    .map(([path]) => {
      const dir = new URL(`${path}/`, root);
      if (!existsSync(dir)) return null;
      const manifest = JSON.parse(readFileSync(new URL('package.json', dir), 'utf8'));
      const file = readdirSync(dir).find((name) => /^(licen[sc]e|copying)(\.|$)/i.test(name));
      const repository = typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url;
      return {
        name: manifest.name,
        version: manifest.version,
        licence: manifest.license ?? 'see the package',
        source: (repository ?? manifest.homepage ?? `https://www.npmjs.com/package/${manifest.name}`)
          .replace(/^git\+/, '')
          .replace(/^(?=[\w-]+\/[\w.-]+$)/, 'https://github.com/'),
        text: file ? readFileSync(new URL(file, dir), 'utf8').trim() : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function thirdPartyNotices() {
  const { version } = JSON.parse(read('package.json'));
  const packages = shippedPackages();
  const parts = [
    `Jellyfied ${version}
Copyright (C) 2026 CharlieGolfX

Jellyfied is free software: you can redistribute it and/or modify it under the terms of the GNU
General Public License as published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version. It is distributed in the hope that it will be
useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
FOR A PARTICULAR PURPOSE. The full licence is at the end of this file.

Source code: https://github.com/CharlieGolfX/jellyfied

Jellyfied is an unofficial client. It is not affiliated with or endorsed by the Jellyfin project
or by Plex, Inc. Jellyfin, Plex, Chromecast and AirPlay are trademarks of their owners.

This file lists what Jellyfied is shipped with, and the licences that come with those parts.
`,
    section(
      'Artwork and fonts',
      `Liberation Sans (the fallback font for styled subtitles, shipped with JASSUB)
  Digitized data copyright (c) 2010 Google Corporation. Copyright (c) 2012 Red Hat, Inc.
  Licensed under the SIL Open Font License, Version 1.1, printed below.

BlurHash
  The image placeholders are decoded the way the reference implementation at
  https://github.com/woltapp/blurhash does it. Copyright (c) 2018 Wolt Enterprises. MIT License.`,
    ),
    section(
      'Libraries',
      packages.map((p) => `${p.name} ${p.version}\n  Licence: ${p.licence}\n  ${p.source}`).join('\n\n') +
        `\n\nCompiled into JASSUB's WebAssembly file (styled subtitles):\n\n` +
        INSIDE_JASSUB.map(([name, id, url]) => `${name}\n  Licence: ${id}\n  ${url}`).join('\n\n'),
    ),
    ...packages.filter((p) => p.text).map((p) => section(`${p.name} ${p.version}: its licence file`, p.text)),
    section(
      `MIT License (${packages
        .filter((p) => !p.text && p.licence === 'MIT')
        .map((p) => p.name)
        .join(', ')}: packages without a licence file of their own)`,
      licence('MIT'),
    ),
    ...JASSUB_LICENCES.map((id) => section(`${id} (parts of JASSUB's WebAssembly file)`, licence(id))),
    section('Apache License 2.0 (hls.js, abslink)', licence('Apache-2.0')),
    section('SIL Open Font License 1.1 (Liberation Sans)', licence('OFL-1.1')),
    section('GNU General Public License, version 3 (Jellyfied, rvfc-polyfill)', read('LICENSE')),
  ];
  return parts.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.stdout.write(thirdPartyNotices());
