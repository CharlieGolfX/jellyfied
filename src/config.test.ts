import { describe, expect, it } from 'vitest';
import pkg from '../package.json';
import { APP_VERSION, normalizeServerUrl } from './config';

describe('normalizeServerUrl', () => {
  it('assumes http when no scheme is given', () => {
    expect(normalizeServerUrl('192.168.1.10:8096')).toBe('http://192.168.1.10:8096');
    expect(normalizeServerUrl('jellyfin.example.com', 'https:')).toBe('https://jellyfin.example.com');
    expect(normalizeServerUrl('http://jellyfin.example.com', 'https:')).toBe('http://jellyfin.example.com');
  });

  it('strips trailing slashes and the web UI path people tend to paste', () => {
    expect(normalizeServerUrl(' https://media.example.com/ ')).toBe('https://media.example.com');
    expect(normalizeServerUrl('https://example.com/jellyfin/web/')).toBe('https://example.com/jellyfin');
    expect(normalizeServerUrl('https://example.com/jellyfin/web/index.html')).toBe('https://example.com/jellyfin');
  });

  it('resolves a path against the page’s own address (proxy mode)', () => {
    expect(normalizeServerUrl('/jellyfin')).toBe(`${window.location.origin}/jellyfin`);
  });

  it('returns nothing for an empty address and throws for one that is not a URL', () => {
    expect(normalizeServerUrl('   ')).toBe('');
    expect(() => normalizeServerUrl('http://')).toThrow();
  });
});

describe('APP_VERSION', () => {
  it('is the version in package.json', () => {
    expect(APP_VERSION).toBe(pkg.version);
  });
});
