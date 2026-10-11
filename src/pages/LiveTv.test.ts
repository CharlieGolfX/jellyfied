import { describe, expect, it } from 'vitest';
import { letterIndex } from '@/api/queries';
import { programProgress } from './LiveTv';

describe('programProgress', () => {
  const program = { StartDate: '2026-10-11T18:00:00Z', EndDate: '2026-10-11T19:00:00Z' };

  it('says how far through its slot a programme is', () => {
    expect(programProgress(program, Date.parse('2026-10-11T18:15:00Z'))).toBe(25);
  });

  it('stays between the start and the end', () => {
    expect(programProgress(program, Date.parse('2026-10-11T17:00:00Z'))).toBe(0);
    expect(programProgress(program, Date.parse('2026-10-11T20:00:00Z'))).toBe(100);
  });

  it('is unknown without usable times', () => {
    expect(programProgress(null, 0)).toBeNull();
    expect(programProgress({ StartDate: program.EndDate, EndDate: program.StartDate }, 0)).toBeNull();
    expect(programProgress({ StartDate: 'soon', EndDate: 'later' }, 0)).toBeNull();
  });
});

describe('letterIndex', () => {
  // 600 titles, 339 of them before M and 39 under M.
  it('is the number of titles before the letter in an A to Z list', () => {
    expect(letterIndex('Ascending', 600, 339, 39)).toBe(339);
  });

  it('is the number of titles after the letter in a Z to A list', () => {
    expect(letterIndex('Descending', 600, 339, 39)).toBe(222);
  });

  it('never points before the start', () => {
    expect(letterIndex('Descending', 10, 8, 5)).toBe(0);
  });
});
