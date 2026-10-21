import { describe, expect, it } from 'vitest';
import { currentLine, isTimed } from './lyrics';

const s = (seconds: number) => seconds * 10_000_000;
const timed = [
  { Text: 'First', Start: s(1) },
  { Text: 'Second', Start: s(5) },
  { Text: '', Start: s(9) },
  { Text: 'Third', Start: s(12) },
];

describe('lyrics', () => {
  it('tells timed lyrics from plain ones', () => {
    expect(isTimed(timed)).toBe(true);
    expect(isTimed([{ Text: 'Just words' }, { Text: 'More words' }])).toBe(false);
  });

  it('finds the line being sung', () => {
    expect(currentLine(timed, 0)).toBe(-1);
    expect(currentLine(timed, 1)).toBe(0);
    expect(currentLine(timed, 6.5)).toBe(1);
    // A pause between lines is a line of its own.
    expect(currentLine(timed, 10)).toBe(2);
    expect(currentLine(timed, 300)).toBe(3);
  });
});
