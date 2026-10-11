import type { StoredSession } from './AuthProvider';

/**
 * A PIN that protects an account that is signed in on this browser while someone else is using it.
 *
 * The account's sign-in (its access token) is encrypted with the PIN. While another account is in
 * use, only the encrypted form is stored, so the token cannot be read out of the browser's storage
 * and the account cannot be switched to without the PIN. The account that is in use right now
 * keeps its token readable, as it has to: the PIN guards switching to an account, not using it.
 *
 * A short PIN can be found by trying every one against the stored data with a program; each try is
 * made slow to hold that up, not to prevent it. More digits help: every extra one makes it ten
 * times as long.
 */
const KEY = 'jellyplex.pins';
/** How often the PIN is hashed over to make one key: what makes a try slow. */
const ROUNDS = 20_000;
/** After this many wrong tries in a row, the PIN can't be tried again for a while. */
export const MAX_TRIES = 5;
export const LOCK_MS = 60_000;

interface StoredPin {
  salt: string;
  /** Tells a right PIN from a wrong one. */
  hash: string;
  /** The account's access token, encrypted with the PIN (hex). Missing on PINs set before tokens were encrypted. */
  token?: string;
  tries?: number;
  lockedUntil?: number;
}

const idOf = (account: Pick<StoredSession, 'serverUrl' | 'userId'>) => `${account.serverUrl}|${account.userId}`;

export function validPin(pin: string): boolean {
  return /^\d{4,12}$/.test(pin);
}

// SHA-256, written out because crypto.subtle only exists on https and localhost, and Jellyplex is
// often opened over plain http on a home network.
const K = new Uint32Array(64);
{
  let n = 0;
  for (let candidate = 2; n < 64; candidate++) {
    let prime = true;
    for (let d = 2; d * d <= candidate; d++) if (candidate % d === 0) prime = false;
    if (prime) K[n++] = (Math.cbrt(candidate) * 2 ** 32) >>> 0;
  }
}

export function sha256(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor((bytes.length * 8) / 2 ** 32));
  view.setUint32(padded.length - 4, (bytes.length * 8) >>> 0);

  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let block = 0; block < padded.length; block += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const t1 = (hh + s1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const t2 = (s0 + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hh;
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, '0')).join('');
}

/** What a PIN and its salt work out to: a value to recognise the PIN by, and a key to encrypt with. */
function derive(pin: string, salt: string): { hash: string; key: string } {
  let value = `${salt}:${pin}`;
  for (let i = 0; i < ROUNDS; i++) value = sha256(value);
  return { hash: sha256(`verify:${value}`), key: sha256(`key:${value}`) };
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => new Uint8Array((hex.match(/../g) ?? []).map((pair) => parseInt(pair, 16)));

/** Encrypts or decrypts: the bytes are combined with a stream of bytes made from the key. */
function crypt(bytes: Uint8Array, key: string): Uint8Array {
  const out = new Uint8Array(bytes.length);
  let block = new Uint8Array();
  for (let i = 0; i < bytes.length; i++) {
    if (i % 32 === 0) block = fromHex(sha256(`${key}:${i / 32}`));
    out[i] = bytes[i] ^ block[i % 32];
  }
  return out;
}

function load(): Record<string, StoredPin> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, StoredPin>) : {};
  } catch {
    return {};
  }
}

function store(pins: Record<string, StoredPin>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(pins));
  } catch {
    /* ignore */
  }
}

export function hasPin(account: Pick<StoredSession, 'serverUrl' | 'userId'>): boolean {
  return Boolean(load()[idOf(account)]?.hash);
}

/** Sets the PIN of an account and locks its access token away with it. */
export function setPin(account: Pick<StoredSession, 'serverUrl' | 'userId'>, pin: string, accessToken: string) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(12)));
  const { hash, key } = derive(pin, salt);
  store({ ...load(), [idOf(account)]: { salt, hash, token: toHex(crypt(new TextEncoder().encode(accessToken), key)) } });
}

/** Whether the account's token is stored encrypted, so that it has to be taken out of the saved account. */
export function sealsToken(account: Pick<StoredSession, 'serverUrl' | 'userId'>): boolean {
  return Boolean(load()[idOf(account)]?.token);
}

export function clearPin(account: Pick<StoredSession, 'serverUrl' | 'userId'>) {
  const pins = load();
  delete pins[idOf(account)];
  store(pins);
}

export type PinCheck = { ok: true; accessToken?: string } | { ok: false; lockedFor?: number; triesLeft?: number };

/**
 * Checks a PIN and keeps count of wrong tries. The right PIN also gives back the access token it
 * locked away. An account without a PIN always passes.
 */
export function checkPin(account: Pick<StoredSession, 'serverUrl' | 'userId'>, pin: string, now = Date.now()): PinCheck {
  const pins = load();
  const saved = pins[idOf(account)];
  if (!saved?.hash) return { ok: true };
  if (saved.lockedUntil && saved.lockedUntil > now) return { ok: false, lockedFor: saved.lockedUntil - now };
  const { hash, key } = derive(pin, saved.salt);
  if (hash === saved.hash) {
    store({ ...pins, [idOf(account)]: { salt: saved.salt, hash: saved.hash, token: saved.token } });
    return { ok: true, accessToken: saved.token ? new TextDecoder().decode(crypt(fromHex(saved.token), key)) : undefined };
  }
  const tries = (saved.lockedUntil ? 0 : (saved.tries ?? 0)) + 1;
  const locked = tries >= MAX_TRIES;
  store({ ...pins, [idOf(account)]: { ...saved, tries: locked ? 0 : tries, lockedUntil: locked ? now + LOCK_MS : undefined } });
  return locked ? { ok: false, lockedFor: LOCK_MS } : { ok: false, triesLeft: MAX_TRIES - tries };
}
