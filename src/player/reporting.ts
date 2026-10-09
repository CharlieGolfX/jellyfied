import type { JellyfinApi } from '@/api/client';

export type PlayMethod = 'DirectPlay' | 'DirectStream' | 'Transcode';

export interface PlaybackReport {
  ItemId: string;
  MediaSourceId?: string;
  PlaySessionId?: string;
  PositionTicks: number;
  IsPaused?: boolean;
  IsMuted?: boolean;
  VolumeLevel?: number;
  PlayMethod?: PlayMethod;
  AudioStreamIndex?: number | null;
  SubtitleStreamIndex?: number | null;
  CanSeek?: boolean;
  EventName?: string;
  NowPlayingQueue?: { Id: string; PlaylistItemId?: string }[];
}

function send(api: JellyfinApi, path: string, body: PlaybackReport, keepalive = false) {
  return api
    .request('POST', path, { body: { ...body, PositionTicks: Math.max(0, Math.round(body.PositionTicks)) }, keepalive })
    .catch(() => {
      /* Reporting failures must never interrupt playback. */
    });
}

export const reportPlaybackStart = (api: JellyfinApi, body: PlaybackReport) =>
  send(api, '/Sessions/Playing', { CanSeek: true, ...body });

export const reportPlaybackProgress = (api: JellyfinApi, body: PlaybackReport) =>
  send(api, '/Sessions/Playing/Progress', { CanSeek: true, ...body });

export const reportPlaybackStopped = (api: JellyfinApi, body: PlaybackReport, keepalive = false) =>
  send(api, '/Sessions/Playing/Stopped', body, keepalive);

export function stopTranscoding(api: JellyfinApi, playSessionId: string, keepalive = false) {
  return api
    .request('DELETE', '/Videos/ActiveEncodings', {
      query: { deviceId: api.deviceId, playSessionId },
      keepalive,
    })
    .catch(() => {});
}
