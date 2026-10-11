import { describe, expect, it } from 'vitest';
import { patchUserData } from './queries';

const movie = (id: string, played = false) => ({ Id: id, Name: id, UserData: { Played: played, IsFavorite: false } });

describe('patchUserData', () => {
  it('changes the item on its own', () => {
    expect(patchUserData(movie('a'), 'a', { Played: true })).toEqual({ Id: 'a', Name: 'a', UserData: { Played: true, IsFavorite: false } });
  });

  it('changes it inside lists, and lists loaded a page at a time', () => {
    const list = { Items: [movie('a'), movie('b')], TotalRecordCount: 2 };
    expect(patchUserData(list, 'b', { IsFavorite: true }).Items[1].UserData.IsFavorite).toBe(true);
    expect(patchUserData([movie('a')], 'a', { Played: true })[0].UserData.Played).toBe(true);
    const pages = { pages: [list, { Items: [movie('c')], TotalRecordCount: 3 }], pageParams: [0, 2] };
    const next = patchUserData(pages, 'c', { Played: true });
    expect(next.pages[1].Items[0].UserData.Played).toBe(true);
    // What did not change is the same object, so nothing else renders again.
    expect(next.pages[0]).toBe(pages.pages[0]);
    expect(next.pageParams).toBe(pages.pageParams);
  });

  it('returns the very same data when the item is not in it', () => {
    const list = { Items: [movie('a')] };
    expect(patchUserData(list, 'x', { Played: true })).toBe(list);
    expect(patchUserData(42, 'x', { Played: true })).toBe(42);
    expect(patchUserData(null, 'x', { Played: true })).toBeNull();
  });
});
