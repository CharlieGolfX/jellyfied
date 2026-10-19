import type Hls from 'hls.js';
import { t } from '@/i18n';

/**
 * Plays an HLS stream in the video element through hls.js, which is fetched the first time a
 * stream needs it: files that play directly never do. Resolves to null when the load was
 * superseded while hls.js was being fetched.
 */
export async function attachHlsJs({
  video,
  url,
  startPosition,
  current,
  onNoProgress,
  onFatal,
}: {
  video: HTMLVideoElement;
  url: string;
  /** Seconds, or -1 for the newest part of a live broadcast. */
  startPosition: number;
  /** Whether this is still the load that should play: errors of an older one are ignored. */
  current: () => boolean;
  /** The browser takes parts of the stream but none of their picture (see below). */
  onNoProgress: () => void;
  /** Playback can't go on; the message says why. */
  onFatal: (message: string) => void;
}): Promise<Hls | null> {
  const { default: HlsPlayer, ErrorDetails, ErrorTypes, Events } = await import('hls.js');
  if (!current()) return null;
  const hls = new HlsPlayer({
    startPosition,
    maxBufferLength: 30,
    maxMaxBufferLength: 120,
    backBufferLength: 90,
    manifestLoadingTimeOut: 30_000,
    enableWorker: true,
  });
  let mediaRecoveries = 0;
  /** Parts the browser took without any of their picture showing up in what it has buffered. */
  const unbuffered = new Set<number | string>();
  hls.on(Events.ERROR, (_e, data) => {
    if (!current()) return;
    // The browser takes parts of the stream, but none of the picture in them shows up in what
    // it has buffered. Firefox does this with HEVC copied from an "open GOP" file, for every
    // part after the first. hls.js would skip each one and fetch on and on; the server
    // encoding the video instead gives parts that each start on a clean picture.
    if (data.details === ErrorDetails.BUFFER_APPEND_NO_PROGRESS && data.parent === 'main' && data.frag) {
      unbuffered.add(data.frag.sn);
      if (unbuffered.size >= 2) onNoProgress();
      return;
    }
    if (!data.fatal) return;
    if (data.type === ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
      mediaRecoveries++;
      hls.recoverMediaError();
      return;
    }
    onFatal(
      data.type === ErrorTypes.NETWORK_ERROR
        ? t('player.video.stream.connectionLost')
        : t('player.playbackError', { details: data.details }),
    );
  });
  hls.loadSource(url);
  hls.attachMedia(video);
  return hls;
}
