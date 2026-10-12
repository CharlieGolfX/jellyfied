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
