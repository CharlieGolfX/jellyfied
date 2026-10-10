import { useSyncExternalStore, type CSSProperties } from 'react';

/** How text subtitles are drawn in the player. Stored in this browser only. */
export interface SubtitleStyle {
  size: 'small' | 'medium' | 'large' | 'xlarge';
  color: 'white' | 'yellow' | 'cyan' | 'green' | 'grey';
  background: 'none' | 'translucent' | 'solid';
  edge: 'none' | 'shadow' | 'outline';
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = { size: 'medium', color: 'white', background: 'none', edge: 'outline' };

export const SUBTITLE_SIZES: { value: SubtitleStyle['size']; label: string; short: string; scale: number }[] = [
  { value: 'small', label: 'Small', short: 'S', scale: 0.75 },
  { value: 'medium', label: 'Medium', short: 'M', scale: 1 },
  { value: 'large', label: 'Large', short: 'L', scale: 1.35 },
  { value: 'xlarge', label: 'Extra large', short: 'XL', scale: 1.75 },
];

export const SUBTITLE_COLORS: { value: SubtitleStyle['color']; label: string; css: string }[] = [
  { value: 'white', label: 'White', css: '#ffffff' },
  { value: 'yellow', label: 'Yellow', css: '#ffe45c' },
  { value: 'cyan', label: 'Cyan', css: '#7fe7ff' },
  { value: 'green', label: 'Green', css: '#8dff8d' },
  { value: 'grey', label: 'Grey', css: '#c4c4c4' },
];

export const SUBTITLE_BACKGROUNDS: { value: SubtitleStyle['background']; label: string; css: string }[] = [
  { value: 'none', label: 'None', css: 'transparent' },
  { value: 'translucent', label: 'Translucent', css: 'rgba(0, 0, 0, 0.6)' },
  { value: 'solid', label: 'Solid black', css: '#000000' },
];

export const SUBTITLE_EDGES: { value: SubtitleStyle['edge']; label: string; css: string }[] = [
  { value: 'none', label: 'None', css: 'none' },
  { value: 'shadow', label: 'Drop shadow', css: '0 0.08em 0.16em rgba(0, 0, 0, 0.95)' },
  {
    value: 'outline',
    label: 'Outline',
    css: '-0.06em -0.06em 0 #000, 0.06em -0.06em 0 #000, -0.06em 0.06em 0 #000, 0.06em 0.06em 0 #000, 0 0.08em 0.18em rgba(0, 0, 0, 0.9)',
  },
];

const KEY = 'jellyplex.subtitleStyle';

function pick<T extends { value: string }>(options: T[], value: unknown, fallback: T['value']): T['value'] {
  return options.some((o) => o.value === value) ? (value as T['value']) : fallback;
}

function read(): SubtitleStyle {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<SubtitleStyle>;
    return {
      size: pick(SUBTITLE_SIZES, raw.size, DEFAULT_SUBTITLE_STYLE.size),
      color: pick(SUBTITLE_COLORS, raw.color, DEFAULT_SUBTITLE_STYLE.color),
      background: pick(SUBTITLE_BACKGROUNDS, raw.background, DEFAULT_SUBTITLE_STYLE.background),
      edge: pick(SUBTITLE_EDGES, raw.edge, DEFAULT_SUBTITLE_STYLE.edge),
    };
  } catch {
    return DEFAULT_SUBTITLE_STYLE;
  }
}

let current = read();
const listeners = new Set<() => void>();

export function setSubtitleStyle(patch: Partial<SubtitleStyle>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSubtitleStyle(): [SubtitleStyle, (patch: Partial<SubtitleStyle>) => void] {
  const value = useSyncExternalStore(subscribe, () => current, () => DEFAULT_SUBTITLE_STYLE);
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
