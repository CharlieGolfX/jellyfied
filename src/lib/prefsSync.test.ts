import { beforeEach, describe, expect, it } from 'vitest';
import { claimLocalPrefs, mergePrefs } from './prefsSync';

const keys = ['theme', 'home'];

describe('mergePrefs', () => {
  it('takes the account’s value where the account has one', () => {
    expect(mergePrefs({ theme: 'remote' }, { theme: 'local', home: null }, keys)).toEqual({ apply: { theme: 'remote' }, push: false });
  });

  it('does nothing when both sides agree', () => {
    expect(mergePrefs({ theme: 'same' }, { theme: 'same', home: null }, keys)).toEqual({ apply: {}, push: false });
  });

  it('sends up what only exists in this browser', () => {
    expect(mergePrefs({ theme: null }, { theme: 'local', home: null }, keys)).toEqual({ apply: {}, push: true });
    expect(mergePrefs({}, { theme: null, home: 'local' }, keys)).toEqual({ apply: {}, push: true });
  });

  it('ignores preferences of other apps stored next to ours', () => {
    expect(mergePrefs({ skipForwardLength: '30000', theme: 'remote' }, { theme: 'remote', home: null }, keys)).toEqual({
      apply: {},
      push: false,
    });
  });
});

describe('claimLocalPrefs', () => {
  beforeEach(() => localStorage.clear());

  it('lets the first user keep what is already there', () => {
    localStorage.setItem('jellyfied.theme', 'a-theme');
    expect(claimLocalPrefs('a')).toEqual([]);
    expect(localStorage.getItem('jellyfied.theme')).toBe('a-theme');
  });

  it('puts the previous user’s values aside and brings them back later', () => {
    claimLocalPrefs('a');
    localStorage.setItem('jellyfied.theme', 'a-theme');
    localStorage.setItem('jellyfied.trackMemory', '{"show":1}');

    expect(claimLocalPrefs('b').sort()).toEqual(['jellyfied.theme', 'jellyfied.trackMemory']);
    expect(localStorage.getItem('jellyfied.theme')).toBeNull();
    expect(localStorage.getItem('jellyfied.trackMemory')).toBeNull();
    localStorage.setItem('jellyfied.theme', 'b-theme');

    expect(claimLocalPrefs('a').sort()).toEqual(['jellyfied.theme', 'jellyfied.trackMemory']);
    expect(localStorage.getItem('jellyfied.theme')).toBe('a-theme');
    expect(localStorage.getItem('jellyfied.trackMemory')).toBe('{"show":1}');

    expect(claimLocalPrefs('b')).toEqual(['jellyfied.theme', 'jellyfied.trackMemory']);
    expect(localStorage.getItem('jellyfied.theme')).toBe('b-theme');
  });

  it('changes nothing for the same user', () => {
    claimLocalPrefs('a');
    localStorage.setItem('jellyfied.theme', 'a-theme');
    expect(claimLocalPrefs('a')).toEqual([]);
  });
});
