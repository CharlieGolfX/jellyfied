import { describe, expect, it } from 'vitest';
import { PLAYING_REFRESH_DELAY, REFRESH_DELAY, refreshDelay } from './LiveUpdates';

describe('refreshDelay', () => {
  it('refreshes shortly after a change when nothing is playing', () => {
    expect(refreshDelay(false, 0)).toBe(REFRESH_DELAY);
    expect(refreshDelay(false, 10 * 60_000)).toBe(REFRESH_DELAY);
  });

  it('holds back while something is playing here, since its own progress reports come back as changes', () => {
    expect(refreshDelay(true, 0)).toBe(PLAYING_REFRESH_DELAY);
    expect(refreshDelay(true, 20_000)).toBe(PLAYING_REFRESH_DELAY - 20_000);
  });

  it('does not wait longer than usual once enough time has passed', () => {
    expect(refreshDelay(true, 5 * 60_000)).toBe(REFRESH_DELAY);
  });
});
