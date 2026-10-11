import type { BaseItemDto, MediaSourceInfo, MediaStream, TrickplayInfo } from '@/api/types';
import { MAX_BITRATE } from '../deviceProfile';
import type { PlayMethod } from '../reporting';

/** Which of the player's menus is open. */
export type PlayerPanel = 'none' | 'settings' | 'subtitles' | 'chapters' | 'picture';

export const BITRATE_KEY = 'jellyplex.maxBitrate';
export const VOLUME_KEY = 'jellyplex.volume';

export const QUALITY_OPTIONS: { label: string; value: number }[] = [
  { label: 'Original / Auto', value: MAX_BITRATE },
  { label: '40 Mbps 4K', value: 40_000_000 },
  { label: '20 Mbps 1080p', value: 20_000_000 },
  { label: '12 Mbps 1080p', value: 12_000_000 },
  { label: '8 Mbps 1080p', value: 8_000_000 },
  { label: '4 Mbps 720p', value: 4_000_000 },
  { label: '3 Mbps 720p', value: 3_000_000 },
  { label: '2 Mbps 480p', value: 2_000_000 },
  { label: '1 Mbps 480p', value: 1_000_000 },
  { label: '720 kbps 360p', value: 720_000 },
];

export interface ActiveStream {
  url: string;
  isHls: boolean;
  method: PlayMethod;
  playSessionId: string;
  source: MediaSourceInfo;
  audioIndex?: number;
  subIndex: number;
  burnedSub: boolean;
  transcodeReasons: string[];
  /** Played by the browser's own HLS player, not hls.js. */
  nativeHls: boolean;
}

export interface LoadOptions {
  start: number;
  audioIndex?: number;
  /** undefined = let the server pick based on user preferences; -1 = off. */
  subIndex?: number;
  bitrate: number;
  mediaSourceId?: string;
  forceTranscode?: boolean;
  /** Buffer without starting (SyncPlay starts everyone at the same moment). */
  holdStart?: boolean;
  /**
   * Hand an HLS stream to the browser's own player instead of hls.js. AirPlay needs that: a video
   * fed through Media Source Extensions can't be sent to another device.
   */
  nativeHls?: boolean;
}

export const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/** Furthest the subtitles can be shifted, in seconds. The slider covers the middle of that range. */
export const MAX_SUBTITLE_DELAY = 60;
export const SUBTITLE_DELAY_SLIDER = 10;

/** Rounds away the floating-point noise of repeated small steps. */
export function clampStep(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, value)) * 1000) / 1000;
}

/** How long a skip button (intro, recap, credits…) stays up on its own when its segment starts. */
export const SKIP_BUTTON_SECONDS = 5;

/** Display width of the seek-bar thumbnail preview, in px. */
export const TRICKPLAY_PREVIEW_WIDTH = 240;

export const pipSupported = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled;

/** Picks the thumbnail resolution closest to the preview size for the playing media source. */
export function pickTrickplay(item: BaseItemDto | undefined, sourceId: string | undefined): TrickplayInfo | null {
  if (!item?.Trickplay || !sourceId) return null;
  const norm = (id: string) => id.replace(/-/g, '').toLowerCase();
  const key = Object.keys(item.Trickplay).find((k) => norm(k) === norm(sourceId));
  const infos = key ? Object.values(item.Trickplay[key]) : [];
  if (!infos.length) return null;
  return infos.reduce((best, i) =>
    Math.abs(i.Width - TRICKPLAY_PREVIEW_WIDTH) < Math.abs(best.Width - TRICKPLAY_PREVIEW_WIDTH) ? i : best,
  );
}

export const SEGMENT_LABELS: Record<string, string> = {
  Intro: 'Skip Intro',
  Recap: 'Skip Recap',
  Preview: 'Skip Preview',
  Outro: 'Skip Credits',
  Commercial: 'Skip Ad',
};

export function streamName(s: MediaStream): string {
  return s.DisplayTitle || [s.Language, s.Codec?.toUpperCase()].filter(Boolean).join(' ') || `Track ${s.Index}`;
}

export function readNumber(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

export function formatSubtitleDelay(seconds: number): string {
  return `${seconds > 0 ? '+' : ''}${seconds.toFixed(1)} s`;
}

export function formatAudioDelay(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  return `${ms > 0 ? '+' : ''}${ms} ms`;
}
