import type { StoredSession } from './AuthProvider';

/**
 * A PIN that is asked for before switching to an account that is signed in on this browser.
 *
 * It stops someone else in the household from picking the account from the menu. It is not a
 * second password: the account's sign-in stays stored in this browser, so anyone who can open the
 * browser's developer tools can get past it.
 */
const KEY = 'jellyplex.pins';
const ROUNDS = 5000;
/** After this many wrong tries in a row, the PIN can't be tried again for a while. */
export const MAX_TRIES = 5;
export const LOCK_MS = 60_000;

interface StoredPin {
  salt: string;
  hash: string;
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

function hashPin(pin: string, salt: string): string {
  let value = `${salt}:${pin}`;
  for (let i = 0; i < ROUNDS; i++) value = sha256(value);
  return value;
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

export function setPin(account: Pick<StoredSession, 'serverUrl' | 'userId'>, pin: string) {
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
  store({ ...load(), [idOf(account)]: { salt, hash: hashPin(pin, salt) } });
}

export function clearPin(account: Pick<StoredSession, 'serverUrl' | 'userId'>) {
  const pins = load();
  delete pins[idOf(account)];
  store(pins);
}

export type PinCheck = { ok: true } | { ok: false; lockedFor?: number; triesLeft?: number };

/** Checks a PIN and keeps count of wrong tries. An account without a PIN always passes. */
export function checkPin(account: Pick<StoredSession, 'serverUrl' | 'userId'>, pin: string, now = Date.now()): PinCheck {
  const pins = load();
  const saved = pins[idOf(account)];
  if (!saved?.hash) return { ok: true };
  if (saved.lockedUntil && saved.lockedUntil > now) return { ok: false, lockedFor: saved.lockedUntil - now };
  if (hashPin(pin, saved.salt) === saved.hash) {
    store({ ...pins, [idOf(account)]: { salt: saved.salt, hash: saved.hash } });
    return { ok: true };
  }
  const tries = (saved.lockedUntil ? 0 : (saved.tries ?? 0)) + 1;
  const locked = tries >= MAX_TRIES;
  store({ ...pins, [idOf(account)]: { ...saved, tries: locked ? 0 : tries, lockedUntil: locked ? now + LOCK_MS : undefined } });
  return locked ? { ok: false, lockedFor: LOCK_MS } : { ok: false, triesLeft: MAX_TRIES - tries };
}
