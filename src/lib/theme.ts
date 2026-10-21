import { useSyncExternalStore } from 'react';
import { onPrefPulled, prefChanged } from './prefsBus';
import { t } from '@/i18n';

/** Interface colours: the accent colour and the background tone. Synced with the account (see prefsSync). */
export interface Theme {
  /** Accent colour as #rrggbb. */
  accent: string;
  background: BackgroundId;
}

export type BackgroundId = 'dark' | 'black' | 'graphite' | 'midnight' | 'plum' | 'forest';

export const ACCENT_PRESETS: { value: string; label: string }[] = [
  { value: '#00a4dc', label: t('lib.theme.jellyfiedBlue') },
  { value: '#aa5cc3', label: t('lib.theme.jellyfiedPurple') },
  { value: '#e5a00d', label: t('lib.theme.amber') },
  { value: '#f76b15', label: t('lib.theme.orange') },
  { value: '#e5484d', label: t('lib.theme.red') },
  { value: '#e93d82', label: t('lib.theme.pink') },
  { value: '#3dbb6b', label: t('lib.theme.green') },
  { value: '#12a594', label: t('lib.theme.teal') },
];

/** Lightness (%) of the background steps 950, 900, 850, 800, 750, 700, 600 and 500. */
const STEPS = ['950', '900', '850', '800', '750', '700', '600', '500'] as const;
const LADDER = [4, 6.5, 9.5, 12.5, 16, 20, 29, 41.5];

export const BACKGROUNDS: { value: BackgroundId; label: string; hue: number; saturation: number; ladder: number[] }[] = [
  { value: 'dark', label: t('lib.theme.jellyfiedDark'), hue: 0, saturation: 0, ladder: LADDER },
  { value: 'black', label: t('lib.theme.blackOled'), hue: 0, saturation: 0, ladder: [0, 0, 5, 8.5, 12, 16, 26, 40] },
  { value: 'graphite', label: t('lib.theme.graphite'), hue: 215, saturation: 9, ladder: [8, 11, 14, 17.5, 21, 25, 34, 46] },
  { value: 'midnight', label: t('lib.theme.midnightBlue'), hue: 222, saturation: 32, ladder: LADDER },
  { value: 'plum', label: t('lib.theme.plum'), hue: 278, saturation: 24, ladder: LADDER },
  { value: 'forest', label: t('lib.theme.forest'), hue: 158, saturation: 22, ladder: LADDER },
];

export const DEFAULT_THEME: Theme = { accent: ACCENT_PRESETS[0].value, background: 'dark' };

const KEY = 'jellyfied.theme';

function backgroundColors(id: BackgroundId): string[] {
  const bg = BACKGROUNDS.find((b) => b.value === id) ?? BACKGROUNDS[0];
  // Lighter steps carry a little less colour, so borders and hover states stay neutral.
  return bg.ladder.map((l, i) => `hsl(${bg.hue} ${Math.round(bg.saturation * (1 - i * 0.05))}% ${l}%)`);
}

/** The page background of a background tone, for previews. */
export function backgroundSwatch(id: BackgroundId): string {
  return backgroundColors(id)[1];
}

function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
}

/** Relative luminance (WCAG) of a #rrggbb colour. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** An accent darkened towards black: `keep` is how much of each channel stays (0–1). */
function darken(hex: string, keep: number): string {
  const channel = (i: number) =>
    Math.round(parseInt(hex.slice(i, i + 2), 16) * keep)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

const contrastWithWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05);

/**
 * The colours for filled surfaces with text on them: the accent made just dark enough for white
 * text to reach WCAG AA (4.5:1), which keeps the colour recognisable for most accents. One that
 * would have to lose more than 30% of its brightness (light yellows and ambers turn brown) keeps
 * its colour and gets dark text instead.
 */
export function accentColors(accent: string): { fill: string; hover: string; ink: string } {
  let keep = 1;
  while (keep > 0.7 && contrastWithWhite(darken(accent, keep)) < 4.5) keep -= 0.01;
  if (contrastWithWhite(darken(accent, keep)) < 4.5) {
    return { fill: accent, hover: `color-mix(in srgb, ${accent} 84%, white)`, ink: '#101010' };
  }
  return { fill: darken(accent, keep), hover: darken(accent, keep - 0.06), ink: '#ffffff' };
}

function read(): Theme {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Theme>;
    return {
      accent: isHexColor(raw.accent) ? raw.accent.toLowerCase() : DEFAULT_THEME.accent,
      background: BACKGROUNDS.some((b) => b.value === raw.background) ? raw.background! : DEFAULT_THEME.background,
    };
  } catch {
    return DEFAULT_THEME;
  }
}

/** Overrides the colour variables from index.css; the defaults there are left alone. */
function apply(theme: Theme) {
  const root = document.documentElement.style;
  if (theme.accent === DEFAULT_THEME.accent) {
    for (const name of ['--color-accent', '--color-accent-hover', '--color-accent-fill', '--color-accent-fill-hover', '--color-accent-ink'])
      root.removeProperty(name);
  } else {
    root.setProperty('--color-accent', theme.accent);
    root.setProperty('--color-accent-hover', `color-mix(in srgb, ${theme.accent} 84%, white)`);
    const colors = accentColors(theme.accent);
    root.setProperty('--color-accent-fill', colors.fill);
    root.setProperty('--color-accent-fill-hover', colors.hover);
    root.setProperty('--color-accent-ink', colors.ink);
  }
  const colors = theme.background === DEFAULT_THEME.background ? null : backgroundColors(theme.background);
  STEPS.forEach((step, i) => {
    if (colors) root.setProperty(`--color-base-${step}`, colors[i]);
    else root.removeProperty(`--color-base-${step}`);
  });
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors ? colors[1] : '#101010');
}

let current = read();
apply(current);
const listeners = new Set<() => void>();

export function setTheme(patch: Partial<Theme>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  apply(current);
  listeners.forEach((l) => l());
  prefChanged(KEY);
}

onPrefPulled(KEY, () => {
  current = read();
  apply(current);
  listeners.forEach((l) => l());
});

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useTheme(): [Theme, (patch: Partial<Theme>) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => current,
    () => DEFAULT_THEME,
  );
  return [value, setTheme];
}
