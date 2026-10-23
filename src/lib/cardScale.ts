import { useSyncExternalStore } from 'react';
import { readString, writeString } from '@/lib/storage';

/**
 * Global poster/card size. The value is exposed to CSS as `--card-scale` on <html>, so every hub,
 * grid and person row resizes from one setting without re-rendering the whole tree.
 */
const KEY = 'jellyfied.cardScale';
export const CARD_SCALE_MIN = 0.6;
export const CARD_SCALE_MAX = 1.8;

function clamp(v: number): number {
  return Math.min(CARD_SCALE_MAX, Math.max(CARD_SCALE_MIN, v));
}

function read(): number {
  const v = Number(readString(KEY));
  return Number.isFinite(v) && v > 0 ? clamp(v) : 1;
}

let current = read();
const listeners = new Set<() => void>();

function apply(v: number) {
  if (typeof document !== 'undefined') document.documentElement.style.setProperty('--card-scale', String(v));
}
apply(current);

export function setCardScale(v: number) {
  current = clamp(Math.round(v * 100) / 100);
  apply(current);
  writeString(KEY, String(current));
  listeners.forEach((l) => l());
}

/** The size right now, for code that should not render again when it changes. */
export const cardScale = () => current;

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useCardScale(): [number, (v: number) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => current,
    () => 1,
  );
  return [value, setCardScale];
}
