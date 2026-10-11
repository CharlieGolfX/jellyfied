import { describe, expect, it } from 'vitest';
import { rowsInView } from './useRowWindow';

describe('rowsInView', () => {
  // 100 items in rows of 5, each row 200 px high: 20 rows, 4000 px.
  it('keeps the rows that overlap the visible area', () => {
    expect(rowsInView(100, 5, 200, 0, 600)).toEqual({ from: 0, to: 15, padTop: 0, padBottom: 3400 });
    expect(rowsInView(100, 5, 200, 1000, 1500)).toEqual({ from: 25, to: 40, padTop: 1000, padBottom: 2400 });
  });

  it('stands in for the rest with padding of the same height', () => {
    const w = rowsInView(100, 5, 200, 1050, 1730);
    expect(w.padTop + ((w.to - w.from) / 5) * 200 + w.padBottom).toBe(4000);
  });

  it('stays inside the list when the area is above or below it', () => {
    expect(rowsInView(100, 5, 200, -900, -100)).toEqual({ from: 0, to: 5, padTop: 0, padBottom: 3800 });
    expect(rowsInView(100, 5, 200, 9000, 9900)).toEqual({ from: 95, to: 100, padTop: 3800, padBottom: 0 });
  });

  it('counts a last row that is not full', () => {
    expect(rowsInView(12, 5, 200, 0, 2000)).toEqual({ from: 0, to: 12, padTop: 0, padBottom: 0 });
  });
});
