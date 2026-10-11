import type { BaseItemDto } from '@/api/types';
import { hourCycleOption } from '@/lib/timeFormat';
import { t } from '@/i18n';

export const TICKS_PER_SECOND = 10_000_000;

export function ticksToSeconds(ticks?: number | null): number {
  return ticks ? ticks / TICKS_PER_SECOND : 0;
}

export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICKS_PER_SECOND);
}

/** 3725 -> "1:02:05", 65 -> "1:05" */
export function formatClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor((totalSeconds / 60) % 60);
  const h = Math.floor(totalSeconds / 3600);
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

/** Ticks -> "1 hr 52 min" */
export function formatRuntime(ticks?: number | null): string {
  if (!ticks) return '';
  const minutes = Math.round(ticks / TICKS_PER_SECOND / 60);
  if (minutes < 1) return '< 1 min';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} hr ${m} min`;
  if (h) return `${h} hr`;
  return `${m} min`;
}

export function formatRemaining(item: BaseItemDto): string {
  const total = item.RunTimeTicks ?? 0;
  const pos = item.UserData?.PlaybackPositionTicks ?? 0;
  if (!total || !pos) return '';
  const minutes = Math.max(1, Math.round((total - pos) / TICKS_PER_SECOND / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min left` : `${minutes} min left`;
}

export function formatBytes(bytes?: number | null, decimals = 1): string {
  if (bytes === undefined || bytes === null || bytes < 0) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : decimals)} ${units[i]}`;
}

export function formatBitrate(bps?: number | null): string {
  if (!bps) return '';
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  return `${Math.round(bps / 1000)} kbps`;
}

export function formatDate(iso?: string | null, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  if (!iso) return '';
  const d = new Date(iso);
  // Exactly zero (1 January 1970) is how a missing date is stored for some files.
  if (Number.isNaN(d.getTime()) || d.getTime() === 0 || d.getFullYear() < 1900) return '';
  return d.toLocaleDateString(undefined, opts);
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  // Exactly zero (1 January 1970) is how a missing date is stored for some files.
  if (Number.isNaN(d.getTime()) || d.getTime() === 0 || d.getFullYear() < 1900) return '';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', ...hourCycleOption() });
}

export function formatRelative(iso?: string | null): string {
  if (!iso) return t('format.never');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 1900) return t('format.never');
  const diff = (Date.now() - d.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (Math.abs(diff) < 60) return 'just now';
  if (Math.abs(diff) < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (Math.abs(diff) < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  if (Math.abs(diff) < 86400 * 30) return rtf.format(-Math.round(diff / 86400), 'day');
  if (Math.abs(diff) < 86400 * 365) return rtf.format(-Math.round(diff / (86400 * 30)), 'month');
  return rtf.format(-Math.round(diff / (86400 * 365)), 'year');
}

export function pad2(n?: number | null): string {
  return n === undefined || n === null ? '' : String(n).padStart(2, '0');
}

/** "S1 · E4" style label for episodes. */
export function episodeLabel(item: BaseItemDto, long = false): string {
  if (item.Type !== 'Episode') return '';
  const s = item.ParentIndexNumber;
  const e = item.IndexNumber;
  const eEnd = item.IndexNumberEnd;
  if (long) {
    const parts: string[] = [];
    if (s !== undefined && s !== null) parts.push(s === 0 ? t('format.special') : t('format.season', { number: s }));
    if (e !== undefined && e !== null) parts.push(t('format.episode', { number: eEnd ? `${e}–${eEnd}` : e }));
    return parts.join(' · ');
  }
  const parts: string[] = [];
  if (s !== undefined && s !== null) parts.push(`S${s}`);
  if (e !== undefined && e !== null) parts.push(`E${e}${eEnd ? `-${eEnd}` : ''}`);
  return parts.join(' · ');
}

export function yearRange(item: BaseItemDto): string {
  if (!item.ProductionYear) return '';
  if (item.Type === 'Series') {
    const end = item.EndDate ? new Date(item.EndDate).getFullYear() : null;
    if (item.Status === 'Continuing') return t('format.yearToPresent', { year: item.ProductionYear });
    if (end && end !== item.ProductionYear) return `${item.ProductionYear} – ${end}`;
  }
  return String(item.ProductionYear);
}

/** The things that are counted somewhere in the interface; each has its wording under "count" in the language files. */
export type CountKind =
  'item' | 'artist' | 'track' | 'title' | 'album' | 'show' | 'collection' | 'episode' | 'episodeTitle' | 'seasonTitle';

/** "1 item", "2,340 items": a number with the word for what it counts, in the right form for the number. */
export function plural(n: number, kind: CountKind): string {
  return t(`count.${kind}`, { count: n, n: n.toLocaleString() });
}

export function playedPercent(item: BaseItemDto): number {
  const pct = item.UserData?.PlayedPercentage;
  if (pct) return Math.min(100, Math.max(0, pct));
  const total = item.RunTimeTicks ?? 0;
  const pos = item.UserData?.PlaybackPositionTicks ?? 0;
  return total && pos ? Math.min(100, (pos / total) * 100) : 0;
}
