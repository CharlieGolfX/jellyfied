import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSleepTimer, getSleepTimer, onSleepTimerFired, sleepAtEndOfVideo, startSleepTimer } from './sleepTimer';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  clearSleepTimer();
  vi.useRealTimers();
});

describe('sleep timer', () => {
  it('fires once when the time is up and then turns itself off', () => {
    const fired = vi.fn();
    const off = onSleepTimerFired(fired);
    startSleepTimer(15);
    expect(getSleepTimer().endsAt).toBe(Date.now() + 15 * 60_000);

    vi.advanceTimersByTime(15 * 60_000 - 1);
    expect(fired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fired).toHaveBeenCalledTimes(1);
    expect(getSleepTimer()).toEqual({ endsAt: null, endOfVideo: false });
    off();
  });

  it('does not fire after being cleared', () => {
    const fired = vi.fn();
    const off = onSleepTimerFired(fired);
    startSleepTimer(30);
    clearSleepTimer();
    vi.advanceTimersByTime(60 * 60_000);
    expect(fired).not.toHaveBeenCalled();
    off();
  });

  it('restarts from now when set again', () => {
    const fired = vi.fn();
    const off = onSleepTimerFired(fired);
    startSleepTimer(15);
    vi.advanceTimersByTime(10 * 60_000);
    startSleepTimer(15);
    vi.advanceTimersByTime(10 * 60_000);
    expect(fired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5 * 60_000);
    expect(fired).toHaveBeenCalledTimes(1);
    off();
  });

  it('"end of video" replaces a running countdown', () => {
    const fired = vi.fn();
    const off = onSleepTimerFired(fired);
    startSleepTimer(15);
    sleepAtEndOfVideo();
    expect(getSleepTimer()).toEqual({ endsAt: null, endOfVideo: true });
    vi.advanceTimersByTime(60 * 60_000);
    expect(fired).not.toHaveBeenCalled();
    off();
  });
});
