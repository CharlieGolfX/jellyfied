import { describe, expect, it } from 'vitest';
import { wheelVolume } from './useWheelVolume';

describe('wheelVolume', () => {
  it('goes up a step for a notch up and down a step for a notch down', () => {
    expect(wheelVolume(0.5, -100)).toBe(0.55);
    expect(wheelVolume(0.5, 100)).toBe(0.45);
  });

  it('stays between silent and full', () => {
    expect(wheelVolume(0.98, -100)).toBe(1);
    expect(wheelVolume(0.02, 100)).toBe(0);
  });

  it('adds up the small movements of a trackpad', () => {
    let volume = 0.5;
    for (let i = 0; i < 10; i++) volume = wheelVolume(volume, -20);
    expect(volume).toBeCloseTo(0.6, 2);
  });

  it('understands wheels that report lines', () => {
    expect(wheelVolume(0.5, -3, 1)).toBe(0.55);
  });

  it('does not leap on one large movement', () => {
    expect(wheelVolume(0.5, -5000)).toBe(0.6);
  });
});
