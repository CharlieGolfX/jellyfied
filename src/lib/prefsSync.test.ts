import { describe, expect, it } from 'vitest';
import { mergePrefs } from './prefsSync';

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
