import { describe, expect, it } from 'vitest';
import { DEFAULT_SEEK_STEPS, parseSeekSteps } from './seekSteps';

describe('parseSeekSteps', () => {
  it('uses 10 seconds back and 30 forward by default', () => {
    expect(parseSeekSteps(null)).toEqual({ back: 10, forward: 30 });
    expect(parseSeekSteps('')).toEqual(DEFAULT_SEEK_STEPS);
  });

  it('reads the saved lengths', () => {
    expect(parseSeekSteps('{"back":5,"forward":60}')).toEqual({ back: 5, forward: 60 });
  });

  it('ignores lengths that are not on offer, and broken data', () => {
    expect(parseSeekSteps('{"back":7,"forward":"30"}')).toEqual(DEFAULT_SEEK_STEPS);
    expect(parseSeekSteps('{"back":15}')).toEqual({ back: 15, forward: 30 });
    expect(parseSeekSteps('not json')).toEqual(DEFAULT_SEEK_STEPS);
    expect(parseSeekSteps('null')).toEqual(DEFAULT_SEEK_STEPS);
  });
});
