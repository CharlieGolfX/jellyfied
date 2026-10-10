import { useSyncExternalStore } from 'react';

/**
 * Sleep timer for the video player: pauses playback after a number of minutes, or when the current
 * video ends. It is global so it survives moving on to the next episode.
 */
export interface SleepTimerState {
  /** Epoch ms when playback will be paused, or null. */
  endsAt: number | null;
  /** Stop after the current video instead of continuing with the next one. */
  endOfVideo: boolean;
}

const OFF: SleepTimerState = { endsAt: null, endOfVideo: false };

let state: SleepTimerState = OFF;
let timeout: number | undefined;
const listeners = new Set<() => void>();
const fireListeners = new Set<() => void>();

function set(next: SleepTimerState) {
  state = next;
  listeners.forEach((l) => l());
}

export function clearSleepTimer() {
  window.clearTimeout(timeout);
  timeout = undefined;
  if (state !== OFF) set(OFF);
}

export function startSleepTimer(minutes: number) {
  window.clearTimeout(timeout);
  const ms = minutes * 60_000;
  timeout = window.setTimeout(() => {
    timeout = undefined;
    set(OFF);
    fireListeners.forEach((l) => l());
  }, ms);
  set({ endsAt: Date.now() + ms, endOfVideo: false });
}

export function sleepAtEndOfVideo() {
  window.clearTimeout(timeout);
  timeout = undefined;
  set({ endsAt: null, endOfVideo: true });
}

/** Called when a timed sleep timer runs out. Returns an unsubscribe function. */
export function onSleepTimerFired(cb: () => void): () => void {
  fireListeners.add(cb);
  return () => fireListeners.delete(cb);
}

export function getSleepTimer(): SleepTimerState {
  return state;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSleepTimer(): SleepTimerState {
  return useSyncExternalStore(subscribe, () => state, () => OFF);
}

export const SLEEP_TIMER_MINUTES = [15, 30, 45, 60, 90, 120];
