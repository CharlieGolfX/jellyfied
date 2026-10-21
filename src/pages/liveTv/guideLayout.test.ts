import { describe, expect, it } from 'vitest';
import type { BaseItemDto } from '@/api/types';
import { halfHours, HOUR_PX, placePrograms, windowStart } from './guideLayout';

const at = (hhmm: string) => Date.parse(`2026-10-21T${hhmm}:00Z`);
const program = (name: string, from: string, to: string) =>
  ({
    Id: name,
    Name: name,
    Type: 'LiveTvProgram',
    StartDate: new Date(at(from)).toISOString(),
    EndDate: new Date(at(to)).toISOString(),
  }) as BaseItemDto;

describe('the guide layout', () => {
  it('starts at the half hour', () => {
    expect(windowStart(at('18:47'))).toBe(at('18:30'));
    expect(halfHours(at('18:30'), 2)).toEqual([at('18:30'), at('19:00'), at('19:30'), at('20:00')]);
  });

  it('places programmes by their times, cut to the window', () => {
    const placed = placePrograms(
      [program('News', '18:00', '19:00'), program('Film', '19:00', '21:00'), program('Late', '22:00', '23:00')],
      at('18:30'),
      2,
    );
    expect(placed.map((p) => [p.program.Name, p.left, p.width, p.cutStart, p.cutEnd])).toEqual([
      ['News', 0, HOUR_PX / 2, true, false],
      ['Film', HOUR_PX / 2, HOUR_PX * 1.5, false, true],
    ]);
  });

  it('never lets two programmes overlap', () => {
    const placed = placePrograms([program('A', '18:30', '19:15'), program('B', '19:00', '20:00')], at('18:30'), 2);
    expect(placed[1].left).toBe(HOUR_PX * 0.75);
    expect(placed[1].width).toBe(HOUR_PX * 0.75);
  });

  it('leaves out what has no usable times', () => {
    expect(placePrograms([{ Id: 'x', Type: 'LiveTvProgram' } as BaseItemDto], at('18:30'))).toEqual([]);
  });
});
