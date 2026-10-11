import { describe, expect, it } from 'vitest';
import { arrangeRows, DEFAULT_HOME_LAYOUT, moveRow, parseHomeLayout } from './homeLayout';

describe('parseHomeLayout', () => {
  it('shows everything, banner included, by default', () => {
    expect(parseHomeLayout(null)).toEqual({ order: [], hidden: [], banner: true });
    expect(parseHomeLayout('not json')).toEqual(DEFAULT_HOME_LAYOUT);
    expect(parseHomeLayout('null')).toEqual(DEFAULT_HOME_LAYOUT);
  });

  it('reads a saved layout and drops anything that is not a row name', () => {
    expect(parseHomeLayout('{"order":["listening",3,"continue"],"hidden":["latest:a"],"banner":false}')).toEqual({
      order: ['listening', 'continue'],
      hidden: ['latest:a'],
      banner: false,
    });
  });
});

describe('arrangeRows', () => {
  const available = ['continue', 'listening', 'latest:a', 'latest:b'];

  it('keeps the usual order without a saved one', () => {
    expect(arrangeRows(available, DEFAULT_HOME_LAYOUT).map((r) => r.id)).toEqual(available);
  });

  it('puts the saved rows first and new libraries after them', () => {
    const rows = arrangeRows(available, { order: ['latest:b', 'continue'], hidden: [], banner: true });
    expect(rows.map((r) => r.id)).toEqual(['latest:b', 'continue', 'listening', 'latest:a']);
  });

  it('ignores rows of libraries that no longer exist, and marks the hidden ones', () => {
    const rows = arrangeRows(available, { order: ['latest:gone', 'listening'], hidden: ['continue', 'latest:gone'], banner: true });
    expect(rows).toEqual([
      { id: 'listening', hidden: false },
      { id: 'continue', hidden: true },
      { id: 'latest:a', hidden: false },
      { id: 'latest:b', hidden: false },
    ]);
  });
});

describe('moveRow', () => {
  it('swaps a row with its neighbour', () => {
    expect(moveRow(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveRow(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
  });

  it('leaves the ends where they are', () => {
    expect(moveRow(['a', 'b'], 'a', -1)).toEqual(['a', 'b']);
    expect(moveRow(['a', 'b'], 'b', 1)).toEqual(['a', 'b']);
    expect(moveRow(['a', 'b'], 'x', 1)).toEqual(['a', 'b']);
  });
});
