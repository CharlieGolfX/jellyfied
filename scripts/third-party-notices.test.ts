// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain script without type declarations
import { thirdPartyNotices as build } from './third-party-notices.mjs';

const root = new URL('../', import.meta.url);
const thirdPartyNotices = build as () => string;
const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as {
  license: string;
  dependencies: Record<string, string>;
};

describe('licenses.txt', () => {
  const text = thirdPartyNotices();

  it("starts with Jellyfied's own licence and where the source is", () => {
    expect(manifest.license).toBe('GPL-3.0-or-later');
    expect(text).toMatch(/^Jellyfied \d+\.\d+\.\d+\nCopyright \(C\)/);
    expect(text).toContain('either version 3 of the\nLicense, or (at your option) any later version');
    expect(text).toContain('https://github.com/CharlieGolfX/jellyfied');
    expect(readFileSync(new URL('LICENSE', root), 'utf8')).toContain('Version 3, 29 June 2007');
  });

  it('names every library the site is shipped with', () => {
    for (const name of Object.keys(manifest.dependencies))
      expect(text, name).toMatch(new RegExp(`^${name.replace(/[/.]/g, '\\$&')} \\d`, 'm'));
    // Not asked for by Jellyfied itself, but bundled with what it asks for.
    for (const name of ['rvfc-polyfill', 'abslink', 'scheduler']) expect(text).toContain(`\n${name} `);
  });

  it('leaves out what is only used to build and test', () => {
    for (const name of ['vite', 'vitest', 'typescript', '@playwright/test']) expect(text).not.toMatch(new RegExp(`^${name} \\d`, 'm'));
  });

  it('carries the licence texts those parts ask to be passed on', () => {
    for (const phrase of [
      'Apache License',
      'SIL OPEN FONT LICENSE',
      'GNU LESSER GENERAL PUBLIC LICENSE',
      'The FreeType Project LICENSE',
      'GNU GENERAL PUBLIC LICENSE',
      'Copyright (c) 2017 Dailymotion',
      'Liberation Sans',
    ]) {
      expect(text, phrase).toContain(phrase);
    }
  });
});
