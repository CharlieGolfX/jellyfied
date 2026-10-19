import type { JellyfinApi } from '@/api/client';
import type { MediaSourceInfo, PlaybackInfoResponse } from '@/api/types';
import { t } from '@/i18n';
import type { PlayMethod } from '../reporting';

/** What to tell the user when the server gives no stream at all. */
export function playbackInfoError(code: NonNullable<PlaybackInfoResponse['ErrorCode']>): string {
  if (code === 'NotAllowed') return t('player.video.stream.notAllowed');
  if (code === 'RateLimitExceeded') return t('player.video.stream.bitrateLimitExceeded');
  return t('player.video.stream.noCompatibleStream');
}

/**
 * How to play a media source the server offered: the file itself when the browser can, otherwise
 * the server's transcode, otherwise the file remuxed. Throws when none of these is offered.
 */
export function pickDelivery(
  api: JellyfinApi,
  itemId: string,
  source: MediaSourceInfo,
  playSessionId: string,
  forceTranscode: boolean | undefined,
): { url: string; method: PlayMethod; isHls: boolean } {
  const staticUrl = () =>
    api.url(
      `/Videos/${itemId}/stream`,
      {
        static: true,
        mediaSourceId: source.Id,
        deviceId: api.deviceId,
        playSessionId,
        Tag: source.ETag ?? undefined,
        LiveStreamId: source.LiveStreamId ?? undefined,
      },
      true,
    );
  if (!forceTranscode && source.SupportsDirectPlay) return { url: staticUrl(), method: 'DirectPlay', isHls: false };
  if (source.TranscodingUrl) {
    return {
      url: /^https?:\/\//i.test(source.TranscodingUrl) ? source.TranscodingUrl : api.serverUrl + source.TranscodingUrl,
      method: 'Transcode',
      isHls: source.TranscodingSubProtocol === 'hls' || /\.m3u8/i.test(source.TranscodingUrl),
    };
  }
  if (!forceTranscode && source.SupportsDirectStream) return { url: staticUrl(), method: 'DirectStream', isHls: false };
  throw new Error(t('player.video.stream.cannotPlay'));
}

/** Why the server transcodes, as it lists the reasons in the transcoding address. */
export function transcodeReasons(source: MediaSourceInfo): string[] {
  if (!source.TranscodingUrl) return [];
  const m = /[?&]TranscodeReasons=([^&]*)/i.exec(source.TranscodingUrl);
  return m ? decodeURIComponent(m[1]).split(',').filter(Boolean) : [];
}
