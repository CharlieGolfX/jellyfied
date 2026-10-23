import { useSyncExternalStore, type CSSProperties } from 'react';
import { onPrefPulled, prefChanged } from '@/lib/prefsBus';
import { t } from '@/i18n';
import { readJson, writeJson } from '@/lib/storage';

/** How text subtitles are drawn in the player. Synced with the account (see prefsSync). */
export interface SubtitleStyle {
  size: 'small' | 'medium' | 'large' | 'xlarge';
  color: 'white' | 'yellow' | 'cyan' | 'green' | 'grey';
  background: 'none' | 'translucent' | 'solid';
  edge: 'none' | 'shadow' | 'outline';
  /**
   * Draw styled (ASS/SSA) subtitles the way their author made them. Off: they are asked for as
   * plain text and get the look chosen here, like every other text subtitle.
   */
  styled: boolean;
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  size: 'medium',
  color: 'white',
  background: 'none',
  edge: 'outline',
  styled: true,
};

export const SUBTITLE_SIZES: { value: SubtitleStyle['size']; label: string; short: string; scale: number }[] = [
  { value: 'small', label: t('player.subtitleStyle.small'), short: 'S', scale: 0.75 },
  { value: 'medium', label: t('player.subtitleStyle.medium'), short: 'M', scale: 1 },
  { value: 'large', label: t('player.subtitleStyle.large'), short: 'L', scale: 1.35 },
  { value: 'xlarge', label: t('player.subtitleStyle.extraLarge'), short: 'XL', scale: 1.75 },
];

export const SUBTITLE_COLORS: { value: SubtitleStyle['color']; label: string; css: string }[] = [
  { value: 'white', label: t('player.subtitleStyle.white'), css: '#ffffff' },
  { value: 'yellow', label: t('player.subtitleStyle.yellow'), css: '#ffe45c' },
  { value: 'cyan', label: t('player.subtitleStyle.cyan'), css: '#7fe7ff' },
  { value: 'green', label: t('player.subtitleStyle.green'), css: '#8dff8d' },
  { value: 'grey', label: t('player.subtitleStyle.grey'), css: '#c4c4c4' },
];

export const SUBTITLE_BACKGROUNDS: { value: SubtitleStyle['background']; label: string; css: string }[] = [
  { value: 'none', label: t('common.none'), css: 'transparent' },
  { value: 'translucent', label: t('player.subtitleStyle.translucent'), css: 'rgba(0, 0, 0, 0.6)' },
  { value: 'solid', label: t('player.subtitleStyle.solidBlack'), css: '#000000' },
];

export const SUBTITLE_EDGES: { value: SubtitleStyle['edge']; label: string; css: string }[] = [
  { value: 'none', label: t('common.none'), css: 'none' },
  { value: 'shadow', label: t('player.subtitleStyle.dropShadow'), css: '0 0.08em 0.16em rgba(0, 0, 0, 0.95)' },
  {
    value: 'outline',
    label: t('player.subtitleStyle.outline'),
    css: '-0.06em -0.06em 0 #000, 0.06em -0.06em 0 #000, -0.06em 0.06em 0 #000, 0.06em 0.06em 0 #000, 0 0.08em 0.18em rgba(0, 0, 0, 0.9)',
  },
];

const KEY = 'jellyfied.subtitleStyle';

function pick<T extends { value: string }>(options: T[], value: unknown, fallback: T['value']): T['value'] {
  return options.some((o) => o.value === value) ? (value as T['value']) : fallback;
}

function read(): SubtitleStyle {
  const stored = readJson(KEY);
  const raw = (stored && typeof stored === 'object' ? stored : {}) as Partial<SubtitleStyle>;
  return {
    size: pick(SUBTITLE_SIZES, raw.size, DEFAULT_SUBTITLE_STYLE.size),
    color: pick(SUBTITLE_COLORS, raw.color, DEFAULT_SUBTITLE_STYLE.color),
    background: pick(SUBTITLE_BACKGROUNDS, raw.background, DEFAULT_SUBTITLE_STYLE.background),
    edge: pick(SUBTITLE_EDGES, raw.edge, DEFAULT_SUBTITLE_STYLE.edge),
    styled: raw.styled !== false,
  };
}

let current = read();
const listeners = new Set<() => void>();

export function setSubtitleStyle(patch: Partial<SubtitleStyle>) {
  current = { ...current, ...patch };
  writeJson(KEY, current);
  listeners.forEach((l) => l());
  prefChanged(KEY);
}

onPrefPulled(KEY, () => {
  current = read();
  listeners.forEach((l) => l());
});

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getSubtitleStyle(): SubtitleStyle {
  return current;
}

export function useSubtitleStyle(): [SubtitleStyle, (patch: Partial<SubtitleStyle>) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => current,
    () => DEFAULT_SUBTITLE_STYLE,
  );
  return [value, setSubtitleStyle];
}

export function subtitleScale(style: SubtitleStyle): number {
  return SUBTITLE_SIZES.find((s) => s.value === style.size)?.scale ?? 1;
}

/** CSS for one subtitle line (everything except the font size, which depends on the player size). */
export function subtitleLineCss(style: SubtitleStyle): CSSProperties {
  return {
    color: SUBTITLE_COLORS.find((c) => c.value === style.color)?.css,
    backgroundColor: SUBTITLE_BACKGROUNDS.find((b) => b.value === style.background)?.css,
    textShadow: SUBTITLE_EDGES.find((e) => e.value === style.edge)?.css,
  };
}
