import { describe, expect, it } from 'vitest';
import { draftProblem, formatTime, parseTime, toDraft, toSegments } from './segmentEditing';

describe('segment editing', () => {
  it('reads times the way people write them', () => {
    expect(parseTime('83')).toBe(83);
    expect(parseTime('1:23')).toBe(83);
    expect(parseTime(' 1:02:03 ')).toBe(3723);
    expect(parseTime('1:23.5')).toBe(83.5);
    expect(parseTime('1:75')).toBeNull();
    expect(parseTime('1.5:20')).toBeNull();
    expect(parseTime('abc')).toBeNull();
    expect(parseTime('')).toBeNull();
  });

  it('writes them back the same way', () => {
    expect(formatTime(83)).toBe('1:23');
    expect(formatTime(83.5)).toBe('1:23.5');
    expect(formatTime(3723)).toBe('1:02:03');
  });

  it('says what is wrong with a row', () => {
    expect(draftProblem({ type: 'Intro', start: '0:10', end: '1:00' }, 600)).toBeNull();
    expect(draftProblem({ type: 'Intro', start: 'x', end: '1:00' })).toBe('badStart');
    expect(draftProblem({ type: 'Intro', start: '1:00', end: '0:30' })).toBe('endBeforeStart');
    expect(draftProblem({ type: 'Outro', start: '11:00', end: '12:00' }, 600)).toBe('pastTheEnd');
  });

  it('turns rows into segments in order, keeping their ids', () => {
    const existing = toDraft({ Id: 'seg-1', ItemId: 'ep', Type: 'Outro', StartTicks: 5_000_000_000, EndTicks: 5_500_000_000 });
    expect(existing).toEqual({ id: 'seg-1', type: 'Outro', start: '8:20', end: '9:10' });
    expect(toSegments([existing, { type: 'Intro', start: '0:05', end: '1:05.5' }])).toEqual([
      { Type: 'Intro', StartTicks: 50_000_000, EndTicks: 655_000_000 },
      { Id: 'seg-1', Type: 'Outro', StartTicks: 5_000_000_000, EndTicks: 5_500_000_000 },
    ]);
  });
});
