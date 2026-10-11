import { describe, expect, it } from 'vitest';
import { letterQuery } from './Library';
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

describe('letterQuery', () => {
  it('asks for titles that start with the letter', () => {
    expect(letterQuery('M')).toEqual({ nameStartsWith: 'M' });
  });

  it('asks for everything before A for the number sign', () => {
    expect(letterQuery('#')).toEqual({ nameLessThan: 'A' });
  });

  it('asks for nothing without a letter', () => {
    expect(letterQuery('')).toEqual({});
  });
});
