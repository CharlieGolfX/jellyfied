import { describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ language: 'en' }));
vi.mock('@/i18n', async (original) => ({ ...(await original<typeof import('@/i18n')>()), currentLanguage: () => m.language }));

import { formatBitrate, formatBytes, formatDate, formatDuration, formatNumber, formatRuntime, TICKS_PER_SECOND } from './format';
import { formatTimeOfDay } from './timeFormat';

const minutes = (n: number) => n * 60 * TICKS_PER_SECOND;
/** Spaces between a number and its unit are often non-breaking; compare without caring which. */
const plain = (text: string) => text.replace(/[  ]/g, ' ');

describe('formats follow the interface language, not the browser', () => {
  it('writes numbers with the separators of the language', () => {
    m.language = 'en';
    expect(formatNumber(12345.5)).toBe('12,345.5');
    m.language = 'es-ES';
    expect(formatNumber(12345.5)).toBe('12.345,5');
    m.language = 'nb';
    expect(plain(formatNumber(12345.5))).toBe('12 345,5');
  });

  it('writes sizes and bitrates with the decimal sign of the language', () => {
    m.language = 'nb';
    expect(formatBytes(1536)).toBe('1,5 KB');
    expect(formatBitrate(8_500_000)).toBe('8,5 Mbps');
    m.language = 'en';
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('abbreviates hours and minutes the way the language does', () => {
    m.language = 'en';
    expect(formatRuntime(minutes(112))).toBe('1 hr 52 min');
    m.language = 'nb';
    expect(plain(formatRuntime(minutes(112)))).toBe('1 t 52 min');
    m.language = 'es-ES';
    expect(plain(formatRuntime(minutes(112)))).toBe('1 h 52 min');
  });

  it('writes how long something took', () => {
    m.language = 'en';
    expect(formatDuration(40)).toBe('40 sec');
    expect(formatDuration(720)).toBe('12 min');
    expect(formatDuration(5400)).toBe('1.5 hr');
    expect(formatDuration(-1)).toBe('');
    m.language = 'es-ES';
    expect(plain(formatDuration(5400))).toBe('1,5 h');
  });

  it('writes dates and times of day in the language', () => {
    m.language = 'es-ES';
    expect(formatDate('2024-03-05T12:00:00Z', { dateStyle: 'long' })).toBe('5 de marzo de 2024');
    m.language = 'nb';
    expect(formatDate('2024-03-05T12:00:00Z', { dateStyle: 'long' })).toBe('5. mars 2024');
    expect(formatTimeOfDay(new Date(2024, 2, 5, 21, 45), '24h')).toBe('21:45');
  });
});
