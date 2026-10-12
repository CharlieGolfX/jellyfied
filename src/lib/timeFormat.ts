import { useSyncExternalStore } from 'react';
import { currentLanguage } from '@/i18n';
import { onPrefPulled, prefChanged } from './prefsBus';

/** Clock style for wall-clock times (24-hour by default). Synced with the account (see prefsSync). */
export type TimeFormat = '24h' | '12h';

const KEY = 'jellyplex.timeFormat';

function read(): TimeFormat {
  try {
    return localStorage.getItem(KEY) === '12h' ? '12h' : '24h';
  } catch {
    return '24h';
  }
}

let current = read();
const listeners = new Set<() => void>();

export function getTimeFormat(): TimeFormat {
  return current;
}

export function setTimeFormat(v: TimeFormat) {
  current = v;
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* ignore */
  }
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

export function useTimeFormat(): [TimeFormat, (v: TimeFormat) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => current,
    () => '24h' as TimeFormat,
  );
  return [value, setTimeFormat];
}

/** Intl options that force the chosen clock style regardless of the browser locale. */
export function hourCycleOption(format: TimeFormat = current): Pick<Intl.DateTimeFormatOptions, 'hourCycle'> {
  return { hourCycle: format === '12h' ? 'h12' : 'h23' };
}

/** "21:45" or "9:45 PM", depending on the user's setting. */
export function formatTimeOfDay(date: Date, format: TimeFormat = current): string {
  return date.toLocaleTimeString(currentLanguage(), {
    hour: format === '12h' ? 'numeric' : '2-digit',
    minute: '2-digit',
    ...hourCycleOption(format),
  });
}
