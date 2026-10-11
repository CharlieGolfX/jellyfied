import { describe, expect, it } from 'vitest';
import { appPath, basePathOf, stripBasePath } from './basePath';

describe('base path', () => {
  it('is empty at the root of a host', () => {
    expect(basePathOf('http://localhost:8080/')).toBe('');
    expect(basePathOf('not a url')).toBe('');
  });

  it('is the path of the <base> tag, without the trailing slash', () => {
    expect(basePathOf('https://example.com/jellyplex/')).toBe('/jellyplex');
    expect(basePathOf('https://example.com/apps/media/')).toBe('/apps/media');
  });

  it('prefixes addresses inside the app', () => {
    expect(appPath('/login', '')).toBe('/login');
    expect(appPath('/login', '/jellyplex')).toBe('/jellyplex/login');
    expect(appPath('login', '/jellyplex')).toBe('/jellyplex/login');
  });

  it('takes the base path off a browser path, and leaves other paths alone', () => {
    expect(stripBasePath('/jellyplex/play/abc', '/jellyplex')).toBe('/play/abc');
    expect(stripBasePath('/jellyplex', '/jellyplex')).toBe('/');
    expect(stripBasePath('/jellyplexy/play', '/jellyplex')).toBe('/jellyplexy/play');
    expect(stripBasePath('/play/abc', '')).toBe('/play/abc');
  });
});
