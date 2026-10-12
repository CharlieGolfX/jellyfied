import { beforeEach, describe, expect, it } from 'vitest';
import { moveOldStorage, oldPrefKey } from './renamed';

describe('storage from before the rename', () => {
  beforeEach(() => localStorage.clear());

  it('is moved to the new names', () => {
    localStorage.setItem('jellyplex.session', '{"userId":"u1"}');
    localStorage.setItem('jellyplex.theme', 'dark');
    localStorage.setItem('unrelated', 'x');
    moveOldStorage(localStorage);
    expect(localStorage.getItem('jellyfied.session')).toBe('{"userId":"u1"}');
    expect(localStorage.getItem('jellyfied.theme')).toBe('dark');
    expect(localStorage.getItem('jellyplex.session')).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('x');
  });

  it('does not overwrite what is already stored under the new name', () => {
    localStorage.setItem('jellyplex.theme', 'old');
    localStorage.setItem('jellyfied.theme', 'new');
    moveOldStorage(localStorage);
    expect(localStorage.getItem('jellyfied.theme')).toBe('new');
    expect(localStorage.getItem('jellyplex.theme')).toBeNull();
  });

  it('knows the old name of a synced preference', () => {
    expect(oldPrefKey('jellyfied.theme')).toBe('jellyplex.theme');
  });
});
