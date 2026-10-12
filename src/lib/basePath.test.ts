import { describe, expect, it } from 'vitest';
import { appPath, basePathOf, stripBasePath } from './basePath';

describe('base path', () => {
  it('is empty at the root of a host', () => {
    expect(basePathOf('http://localhost:8080/')).toBe('');
    expect(basePathOf('not a url')).toBe('');
  });

  it('is the path of the <base> tag, without the trailing slash', () => {
    expect(basePathOf('https://example.com/jellyfied/')).toBe('/jellyfied');
    expect(basePathOf('https://example.com/apps/media/')).toBe('/apps/media');
  });

  it('prefixes addresses inside the app', () => {
    expect(appPath('/login', '')).toBe('/login');
    expect(appPath('/login', '/jellyfied')).toBe('/jellyfied/login');
    expect(appPath('login', '/jellyfied')).toBe('/jellyfied/login');
  });

  it('takes the base path off a browser path, and leaves other paths alone', () => {
    expect(stripBasePath('/jellyfied/play/abc', '/jellyfied')).toBe('/play/abc');
    expect(stripBasePath('/jellyfied', '/jellyfied')).toBe('/');
    expect(stripBasePath('/jellyfiedy/play', '/jellyfied')).toBe('/jellyfiedy/play');
    expect(stripBasePath('/play/abc', '')).toBe('/play/abc');
  });
});
