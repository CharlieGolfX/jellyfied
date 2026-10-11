import { beforeEach, describe, expect, it } from 'vitest';
import { checkPin, clearPin, hasPin, LOCK_MS, MAX_TRIES, setPin, sha256, validPin } from './accountPin';

const account = { serverUrl: 'http://jellyfin.test', userId: 'user-1' };
const other = { serverUrl: 'http://jellyfin.test', userId: 'user-2' };

beforeEach(() => localStorage.clear());

describe('sha256', () => {
  it('matches the published test vectors', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });
});

describe('account PIN', () => {
  it('accepts 4 to 12 digits', () => {
    expect(validPin('1234')).toBe(true);
    expect(validPin('123')).toBe(false);
    expect(validPin('12a4')).toBe(false);
    expect(validPin('1234567890123')).toBe(false);
  });

  it('lets an account without a PIN through', () => {
    expect(hasPin(account)).toBe(false);
    expect(checkPin(account, '')).toEqual({ ok: true });
  });

  it('accepts the right PIN and refuses a wrong one, per account', () => {
    setPin(account, '4821');
    expect(hasPin(account)).toBe(true);
    expect(hasPin(other)).toBe(false);
    expect(checkPin(account, '4821')).toEqual({ ok: true });
    expect(checkPin(account, '0000')).toEqual({ ok: false, triesLeft: MAX_TRIES - 1 });
  });

  it('does not keep the PIN itself', () => {
    setPin(account, '4821');
    expect(localStorage.getItem('jellyplex.pins')).not.toContain('4821');
  });

  it('locks after too many wrong tries, and opens again later', () => {
    setPin(account, '4821');
    const now = 1_000_000;
    for (let i = 1; i < MAX_TRIES; i++) expect(checkPin(account, '0000', now).ok).toBe(false);
    expect(checkPin(account, '0000', now)).toEqual({ ok: false, lockedFor: LOCK_MS });
    // Even the right PIN has to wait.
    expect(checkPin(account, '4821', now + 1000)).toEqual({ ok: false, lockedFor: LOCK_MS - 1000 });
    expect(checkPin(account, '4821', now + LOCK_MS + 1)).toEqual({ ok: true });
  });

  it('can be removed', () => {
    setPin(account, '4821');
    clearPin(account);
    expect(hasPin(account)).toBe(false);
  });
});
