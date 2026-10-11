import { describe, expect, it } from 'vitest';
import type { BaseItemDto } from '@/api/types';
import {
  episodeLabel,
  formatBitrate,
  formatDate,
  formatBytes,
  formatClock,
  formatRemaining,
  formatRuntime,
  playedPercent,
  plural,
  secondsToTicks,
  ticksToSeconds,
  TICKS_PER_SECOND,
  yearRange,
} from './format';

const item = (fields: Partial<BaseItemDto>) => fields as BaseItemDto;
const minutes = (n: number) => n * 60 * TICKS_PER_SECOND;

describe('ticks', () => {
  it('converts both ways', () => {
    expect(ticksToSeconds(25_000_000)).toBe(2.5);
    expect(secondsToTicks(2.5)).toBe(25_000_000);
  });

  it('treats a missing value as zero', () => {
    expect(ticksToSeconds(undefined)).toBe(0);
    expect(ticksToSeconds(null)).toBe(0);
  });
});

describe('formatClock', () => {
  it('shows minutes and seconds below an hour', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(3599.9)).toBe('59:59');
  });

  it('adds hours and pads minutes from an hour on', () => {
    expect(formatClock(3725)).toBe('1:02:05');
  });

  it('falls back to zero for values that are not a time', () => {
    expect(formatClock(-5)).toBe('0:00');
    expect(formatClock(Number.NaN)).toBe('0:00');
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe('0:00');
  });
});

describe('formatRuntime', () => {
  it('formats hours and minutes', () => {
    expect(formatRuntime(minutes(112))).toBe('1 hr 52 min');
    expect(formatRuntime(minutes(120))).toBe('2 hr');
    expect(formatRuntime(minutes(45))).toBe('45 min');
  });

  it('handles very short and missing runtimes', () => {
    expect(formatRuntime(10 * TICKS_PER_SECOND)).toBe('< 1 min');
    expect(formatRuntime(0)).toBe('');
    expect(formatRuntime(null)).toBe('');
  });
});

describe('formatRemaining', () => {
  it('is empty until something was watched', () => {
    expect(formatRemaining(item({ RunTimeTicks: minutes(90) }))).toBe('');
  });

  it('shows what is left', () => {
    expect(formatRemaining(item({ RunTimeTicks: minutes(90), UserData: { PlaybackPositionTicks: minutes(60) } }))).toBe('30 min left');
    expect(formatRemaining(item({ RunTimeTicks: minutes(150), UserData: { PlaybackPositionTicks: minutes(15) } }))).toBe(
      '2 hr 15 min left',
    );
  });

  it('never says less than a minute', () => {
    expect(formatRemaining(item({ RunTimeTicks: minutes(90), UserData: { PlaybackPositionTicks: minutes(90) - 1 } }))).toBe('1 min left');
  });
});

describe('formatBytes', () => {
  it('picks a unit', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GB');
  });

  it('shows a dash when the size is unknown', () => {
    expect(formatBytes(undefined)).toBe('—');
    expect(formatBytes(-1)).toBe('—');
  });
});

describe('formatBitrate', () => {
  it('uses Mbps from one megabit on', () => {
    expect(formatBitrate(8_500_000)).toBe('8.5 Mbps');
    expect(formatBitrate(320_000)).toBe('320 kbps');
    expect(formatBitrate(null)).toBe('');
  });
});

describe('episodeLabel', () => {
  it('is empty for anything but an episode', () => {
    expect(episodeLabel(item({ Type: 'Movie', IndexNumber: 1 }))).toBe('');
  });

  it('has a short and a long form', () => {
    const episode = item({ Type: 'Episode', ParentIndexNumber: 2, IndexNumber: 4 });
    expect(episodeLabel(episode)).toBe('S2 · E4');
    expect(episodeLabel(episode, true)).toBe('Season 2 · Episode 4');
  });

  it('shows double episodes as a range and season 0 as a special', () => {
    const double = item({ Type: 'Episode', ParentIndexNumber: 0, IndexNumber: 1, IndexNumberEnd: 2 });
    expect(episodeLabel(double)).toBe('S0 · E1-2');
    expect(episodeLabel(double, true)).toBe('Special · Episode 1–2');
  });
});

describe('yearRange', () => {
  it('shows a single year for a movie', () => {
    expect(yearRange(item({ Type: 'Movie', ProductionYear: 1999 }))).toBe('1999');
    expect(yearRange(item({ Type: 'Movie' }))).toBe('');
  });

  it('shows the run of a series', () => {
    expect(yearRange(item({ Type: 'Series', ProductionYear: 2008, EndDate: '2013-09-29T00:00:00Z' }))).toBe('2008 – 2013');
    expect(yearRange(item({ Type: 'Series', ProductionYear: 2020, Status: 'Continuing' }))).toBe('2020 – Present');
    expect(yearRange(item({ Type: 'Series', ProductionYear: 2019, EndDate: '2019-06-03T00:00:00Z' }))).toBe('2019');
  });
});

describe('plural', () => {
  it('picks the word by count', () => {
    expect(plural(1, 'item')).toBe('1 item');
    expect(plural(0, 'item')).toBe('0 items');
    expect(plural(2, 'library', 'libraries')).toBe('2 libraries');
  });
});

describe('playedPercent', () => {
  it('prefers the percentage the server gives, kept within 0–100', () => {
    expect(playedPercent(item({ UserData: { PlayedPercentage: 42 } }))).toBe(42);
    expect(playedPercent(item({ UserData: { PlayedPercentage: 140 } }))).toBe(100);
  });

  it('works it out from the position otherwise', () => {
    expect(playedPercent(item({ RunTimeTicks: 200, UserData: { PlaybackPositionTicks: 50 } }))).toBe(25);
    expect(playedPercent(item({ RunTimeTicks: 200 }))).toBe(0);
  });
});

describe('formatDate', () => {
  it('formats a date', () => {
    expect(formatDate('2024-03-05T12:00:00Z', { year: 'numeric', timeZone: 'UTC' })).toBe('2024');
  });

  it('shows nothing for a missing date, including the ways servers store "no date"', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate('not a date')).toBe('');
    expect(formatDate('0001-01-01T00:00:00.0000000Z')).toBe('');
    expect(formatDate('1970-01-01T00:00:00.0000000Z')).toBe('');
  });
});
