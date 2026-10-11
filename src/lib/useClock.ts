import { useSyncExternalStore } from 'react';

interface Clock {
  now: number;
  listeners: Set<() => void>;
  timer?: number;
}

const clocks = new Map<number, Clock>();

function clock(interval: number): Clock {
  let c = clocks.get(interval);
  if (!c) clocks.set(interval, (c = { now: Date.now(), listeners: new Set() }));
  return c;
}

/**
 * The current time in milliseconds, re-rendering the component every `interval` ms. Rendering
 * stays pure this way: the time comes in from outside instead of being read during render.
 */
export function useClock(interval: number): number {
  return useSyncExternalStore(
    (listener) => {
      const c = clock(interval);
      c.listeners.add(listener);
      if (c.timer === undefined) {
        c.now = Date.now();
        c.timer = window.setInterval(() => {
          c.now = Date.now();
          c.listeners.forEach((l) => l());
        }, interval);
      }
      return () => {
        c.listeners.delete(listener);
        if (c.listeners.size === 0) {
          window.clearInterval(c.timer);
          c.timer = undefined;
        }
      };
    },
    () => clock(interval).now,
    () => 0,
  );
}
