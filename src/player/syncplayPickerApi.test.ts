import { describe, expect, it } from 'vitest';
import { finalRotation, slicePath, wheelSlices } from './syncplayPickerApi';

describe('the picker wheel', () => {
  it('gives each entry a share of the circle that follows its weight', () => {
    expect(
      wheelSlices([
        { id: 'a', weight: 1 },
        { id: 'b', weight: 2 },
        { id: 'c', weight: 1 },
      ]),
    ).toEqual([
      { id: 'a', start: 0, end: 90 },
      { id: 'b', start: 90, end: 270 },
      { id: 'c', start: 270, end: 360 },
    ]);
  });

  it('turns so the pointer at the top ends in the winner’s slice, at the chosen spot', () => {
    const slices = wheelSlices([
      { id: 'a', weight: 1 },
      { id: 'b', weight: 3 },
    ]);
    const turned = finalRotation(slices, { winner: 'b', offset: 0.5, turns: 6 });
    // Slice b runs 90°–360°; halfway is 225°. Turning the wheel by -225° (mod 360) brings it to the top.
    expect(turned).toBe(6 * 360 - 225);
    const atPointer = (((-turned % 360) + 360) % 360) as number;
    const winner = slices.find((s) => atPointer >= s.start && atPointer < s.end);
    expect(winner?.id).toBe('b');
  });

  it('draws a single entry as the whole circle', () => {
    expect(slicePath(100, 100, 90, 0, 360)).toContain('A 90 90 0 1 1');
    expect(slicePath(100, 100, 90, 0, 90)).toBe('M 100 100 L 100.00 10.00 A 90 90 0 0 1 190.00 100.00 Z');
  });
});
