import { afterEach, describe, expect, it, vi } from 'vitest';
import { readJson, readString, writeJson, writeString } from './storage';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('storage', () => {
  it('reads and writes text and JSON, and removes with null', () => {
    expect(writeString('a', 'x')).toBe(true);
    expect(readString('a')).toBe('x');
    writeJson('b', { n: 1 });
    expect(readJson('b')).toEqual({ n: 1 });
    writeString('a', null);
    expect(readString('a')).toBeNull();
  });

  it('gives nothing for what is missing or isn’t JSON', () => {
    expect(readJson('missing')).toBeUndefined();
    localStorage.setItem('bad', '{nope');
    expect(readJson('bad')).toBeUndefined();
  });

  it('never throws when storage refuses every call', () => {
    for (const name of ['getItem', 'setItem', 'removeItem'] as const) {
      vi.spyOn(Storage.prototype, name).mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError');
      });
    }
    expect(readString('a')).toBeNull();
    expect(readJson('a')).toBeUndefined();
    expect(writeString('a', 'x')).toBe(false);
    expect(writeString('a', null)).toBe(false);
    expect(writeJson('a', 1)).toBe(false);
  });
});
