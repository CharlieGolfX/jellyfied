import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkPin, clearPin, hasPin, LOCK_MS, MAX_TRIES, PBKDF2_ROUNDS, sealsToken, setPin, sha256, validPin } from './accountPin';

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

const stored = () =>
  (JSON.parse(localStorage.getItem('jellyplex.pins')!) as Record<string, Record<string, unknown>>)['http://jellyfin.test|user-1'];
/** As over plain http, where a browser has no `crypto.subtle`. */
const withoutWebCrypto = () => vi.spyOn(globalThis.crypto, 'subtle', 'get').mockReturnValue(undefined as unknown as SubtleCrypto);

afterEach(() => vi.restoreAllMocks());

describe.each(['with the browser\u2019s cryptography', 'without it (plain http)'])('account PIN, %s', (way) => {
  beforeEach(() => {
    if (way.startsWith('without')) withoutWebCrypto();
  });

  it('accepts 4 to 12 digits', () => {
    expect(validPin('1234')).toBe(true);
    expect(validPin('123')).toBe(false);
    expect(validPin('12a4')).toBe(false);
    expect(validPin('1234567890123')).toBe(false);
  });

  it('lets an account without a PIN through', async () => {
    expect(hasPin(account)).toBe(false);
    expect(await checkPin(account, '')).toEqual({ ok: true });
  });

  it('accepts the right PIN and refuses a wrong one, per account', async () => {
    await setPin(account, '4821', 'token-abc');
    expect(hasPin(account)).toBe(true);
    expect(hasPin(other)).toBe(false);
    expect((await checkPin(account, '4821')).ok).toBe(true);
    expect(await checkPin(account, '0000')).toEqual({ ok: false, triesLeft: MAX_TRIES - 1 });
  });

  it('gives the access token back for the right PIN only', async () => {
    await setPin(account, '4821', 'a-long-access-token-0123456789abcdef-0123456789abcdef');
    expect(sealsToken(account)).toBe(true);
    expect(await checkPin(account, '4821')).toEqual({ ok: true, accessToken: 'a-long-access-token-0123456789abcdef-0123456789abcdef' });
    expect((await checkPin(account, '4822')).ok).toBe(false);
  });

  it('does not keep the access token in a readable form', async () => {
    await setPin(account, '4821', 'token-abc');
    const raw = localStorage.getItem('jellyplex.pins')!;
    expect(raw).not.toContain('token-abc');
    // Not merely written in another notation either.
    expect(raw).not.toContain(Array.from(new TextEncoder().encode('token-abc'), (b) => b.toString(16)).join(''));
  });

  it('encrypts differently each time, even for the same PIN and token', async () => {
    await setPin(account, '4821', 'token-abc');
    const first = localStorage.getItem('jellyplex.pins');
    await setPin(account, '4821', 'token-abc');
    expect(localStorage.getItem('jellyplex.pins')).not.toBe(first);
  });

  it('does not keep the PIN itself', async () => {
    await setPin(account, '4821', 'token-abc');
    expect(localStorage.getItem('jellyplex.pins')).not.toContain('4821');
  });

  it('locks after too many wrong tries, and opens again later', async () => {
    await setPin(account, '4821', 'token-abc');
    const now = 1_000_000;
    for (let i = 1; i < MAX_TRIES; i++) expect((await checkPin(account, '0000', now)).ok).toBe(false);
    expect(await checkPin(account, '0000', now)).toEqual({ ok: false, lockedFor: LOCK_MS });
    // Even the right PIN has to wait.
    expect(await checkPin(account, '4821', now + 1000)).toEqual({ ok: false, lockedFor: LOCK_MS - 1000 });
    expect((await checkPin(account, '4821', now + LOCK_MS + 1)).ok).toBe(true);
    // Every try runs the slow hash written in JavaScript, which takes a while on a busy machine.
  }, 30_000);

  it('can be removed', async () => {
    await setPin(account, '4821', 'token-abc');
    clearPin(account);
    expect(hasPin(account)).toBe(false);
  });
});

describe('how the PIN is kept', () => {
  it('uses PBKDF2 and AES-GCM where the browser has them', async () => {
    await setPin(account, '4821', 'token-abc');
    expect(stored()).toMatchObject({ kdf: 'pbkdf2', rounds: PBKDF2_ROUNDS });
  });

  it('falls back to its own SHA-256 where it does not', async () => {
    withoutWebCrypto();
    await setPin(account, '4821', 'token-abc');
    expect(stored().kdf).toBeUndefined();
    expect(await checkPin(account, '4821')).toEqual({ ok: true, accessToken: 'token-abc' });
  });

  it('moves an older PIN to the stronger form when it is entered', async () => {
    const off = withoutWebCrypto();
    await setPin(account, '4821', 'token-abc');
    off.mockRestore();
    expect(await checkPin(account, '0000')).toEqual({ ok: false, triesLeft: MAX_TRIES - 1 });
    expect(stored().kdf).toBeUndefined();
    expect(await checkPin(account, '4821')).toEqual({ ok: true, accessToken: 'token-abc' });
    expect(stored()).toMatchObject({ kdf: 'pbkdf2', rounds: PBKDF2_ROUNDS });
    expect(stored().tries).toBeUndefined();
    expect(await checkPin(account, '4821')).toEqual({ ok: true, accessToken: 'token-abc' });
  });

  it('refuses a token that was changed in storage', async () => {
    await setPin(account, '4821', 'token-abc');
    const all = JSON.parse(localStorage.getItem('jellyplex.pins')!) as Record<string, { token: string }>;
    const record = all['http://jellyfin.test|user-1'];
    record.token = record.token.slice(0, -2) + (record.token.endsWith('00') ? '01' : '00');
    localStorage.setItem('jellyplex.pins', JSON.stringify(all));
    expect((await checkPin(account, '4821')).ok).toBe(false);
  });
});
