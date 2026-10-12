import { isSafari } from '@/api/device';

/**
 * Whether hls.js can play in this browser, worked out without loading it: the same test hls.js
 * makes itself, Media Source Extensions that take H.264 and AAC in MP4. hls.js is large and only
 * needed when the server sends HLS (a transcode or a remux), so it is fetched at that moment.
 */
export function hlsJsSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const scope = window as unknown as Record<string, unknown>;
  const mediaSource = (scope.ManagedMediaSource ?? scope.MediaSource ?? scope.WebKitMediaSource) as
    { isTypeSupported?: (type: string) => boolean } | undefined;
  if (!mediaSource || typeof mediaSource.isTypeSupported !== 'function') return false;
  const sourceBuffer = (scope.ManagedSourceBuffer ?? scope.SourceBuffer ?? scope.WebKitSourceBuffer) as
    { prototype?: { appendBuffer?: unknown; remove?: unknown } } | undefined;
  // Old implementations without these cannot be driven by hls.js.
  if (
    sourceBuffer?.prototype &&
    (typeof sourceBuffer.prototype.appendBuffer !== 'function' || typeof sourceBuffer.prototype.remove !== 'function')
  ) {
    return false;
  }
  return mediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E,mp4a.40.2"');
}

/**
 * Whether the browser plays HLS by itself, which saves fetching hls.js. Only Safari is trusted
 * with it: other browsers that claim to play HLS do so less completely than hls.js does.
 */
export function nativeHlsSupported(): boolean {
  if (typeof document === 'undefined' || !isSafari()) return false;
  return document.createElement('video').canPlayType('application/vnd.apple.mpegurl') !== '';
}

/**
 * Whether an HLS stream goes to the browser's own player instead of hls.js. The browser's player
 * is the only choice without hls.js and for AirPlay, which can't send a video fed through Media
 * Source Extensions. hls.js is the only choice for the audio delay, because Safari doesn't let
 * the sound of its own HLS player through Web Audio, and the fallback when that player failed.
 */
export function playsHlsNatively(o: {
  native: boolean;
  hlsJs: boolean;
  airPlay: boolean;
  audioDelayed: boolean;
  nativeFailed: boolean;
}): boolean {
  if (!o.hlsJs || o.airPlay) return true;
  return o.native && !o.audioDelayed && !o.nativeFailed;
}
