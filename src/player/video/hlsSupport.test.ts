import { afterEach, describe, expect, it, vi } from 'vitest';
import { nativeHlsSupported, playsHlsNatively } from './hlsSupport';

const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

describe('nativeHlsSupported', () => {
  afterEach(() => vi.restoreAllMocks());

  const browser = (userAgent: string, answer: CanPlayTypeResult) => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation((type) =>
      type === 'application/vnd.apple.mpegurl' ? answer : '',
    );
  };

  it('is true in Safari, which plays HLS by itself', () => {
    browser(SAFARI, 'maybe');
    expect(nativeHlsSupported()).toBe(true);
  });

  it('is false in a Safari that says it cannot', () => {
    browser(SAFARI, '');
    expect(nativeHlsSupported()).toBe(false);
  });

  it('leaves other browsers on hls.js even when they say they play HLS', () => {
    browser(CHROME, 'maybe');
    expect(nativeHlsSupported()).toBe(false);
  });
});

describe('playsHlsNatively', () => {
  const safari = { native: true, hlsJs: true, airPlay: false, audioDelayed: false, nativeFailed: false };

  it("uses the browser's own player where it has one, so hls.js is not fetched", () => {
    expect(playsHlsNatively(safari)).toBe(true);
  });

  it('uses hls.js everywhere else', () => {
    expect(playsHlsNatively({ ...safari, native: false })).toBe(false);
  });

  it('has no choice without hls.js, or for AirPlay', () => {
    expect(playsHlsNatively({ ...safari, native: false, hlsJs: false })).toBe(true);
    expect(playsHlsNatively({ ...safari, airPlay: true, audioDelayed: true, nativeFailed: true })).toBe(true);
  });

  it('goes back to hls.js for the audio delay, and after the own player failed', () => {
    expect(playsHlsNatively({ ...safari, audioDelayed: true })).toBe(false);
    expect(playsHlsNatively({ ...safari, nativeFailed: true })).toBe(false);
  });
});
