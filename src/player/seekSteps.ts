import { useSyncExternalStore } from 'react';
import { onPrefPulled, prefChanged } from '@/lib/prefsBus';
import { readString, writeJson } from '@/lib/storage';

/** How far the skip buttons and arrow keys jump, in seconds. Synced with the account (see prefsSync). */
export interface SeekSteps {
  back: number;
  forward: number;
}

export const DEFAULT_SEEK_STEPS: SeekSteps = { back: 10, forward: 30 };
export const SEEK_STEP_OPTIONS = [5, 10, 15, 30, 60, 90];

const KEY = 'jellyfied.seekSteps';

function pick(value: unknown, fallback: number): number {
  return SEEK_STEP_OPTIONS.includes(value as number) ? (value as number) : fallback;
}

export function parseSeekSteps(raw: string | null): SeekSteps {
  try {
    const parsed = JSON.parse(raw ?? '{}') as Partial<SeekSteps> | null;
    return { back: pick(parsed?.back, DEFAULT_SEEK_STEPS.back), forward: pick(parsed?.forward, DEFAULT_SEEK_STEPS.forward) };
  } catch {
    return DEFAULT_SEEK_STEPS;
  }
}

function read(): SeekSteps {
  return parseSeekSteps(readString(KEY));
}

let current = read();
const listeners = new Set<() => void>();

export function getSeekSteps(): SeekSteps {
  return current;
}

export function setSeekSteps(patch: Partial<SeekSteps>) {
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

export function useSeekSteps(): [SeekSteps, (patch: Partial<SeekSteps>) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => current,
    () => DEFAULT_SEEK_STEPS,
  );
  return [value, setSeekSteps];
}
