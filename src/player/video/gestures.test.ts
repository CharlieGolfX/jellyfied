import { describe, expect, it } from 'vitest';
import { formatSeekDelta, swipeSeconds, tapZone } from './gestures';

describe('tapZone', () => {
  it('splits the player into a left, middle and right part', () => {
    expect(tapZone(50, 1000)).toBe('left');
    expect(tapZone(500, 1000)).toBe('center');
    expect(tapZone(900, 1000)).toBe('right');
  });

  it('treats a player without a size as the middle', () => {
    expect(tapZone(10, 0)).toBe('center');
  });
});

describe('swipeSeconds', () => {
  it('covers a tenth of a film across the whole width', () => {
    expect(swipeSeconds(1000, 1000, 2000)).toBe(200);
    expect(swipeSeconds(-500, 1000, 2000)).toBe(-100);
  });

  it('never covers less than a minute or more than five', () => {
    expect(swipeSeconds(1000, 1000, 300)).toBe(60);
    expect(swipeSeconds(1000, 1000, 3 * 60 * 60)).toBe(300);
  });

  it('covers the whole of a clip shorter than a minute', () => {
    expect(swipeSeconds(1000, 1000, 20)).toBe(20);
  });

  it('does nothing while the duration is unknown', () => {
    expect(swipeSeconds(300, 1000, 0)).toBe(0);
    expect(swipeSeconds(300, 1000, Infinity)).toBe(0);
    expect(swipeSeconds(300, 0, 600)).toBe(0);
  });
});

describe('formatSeekDelta', () => {
  it('shows the direction and the time', () => {
    expect(formatSeekDelta(45)).toBe('+0:45');
    expect(formatSeekDelta(-70.4)).toBe('−1:10');
    expect(formatSeekDelta(0)).toBe('+0:00');
  });
});
