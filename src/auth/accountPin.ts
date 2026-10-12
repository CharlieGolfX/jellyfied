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
 *
 * On https and localhost the browser's own cryptography does the work (PBKDF2 for the key, AES-GCM
 * for the token), which makes a try far slower than the code here could. Over plain http a browser
 * does not offer it, so there the same is done with the SHA-256 written out below. A PIN set that
 * way is moved to the stronger form the first time it is entered where that exists.
 */
const KEY = 'jellyfied.pins';
/** How often the PIN is hashed over to make one key: what makes a try slow. */
const ROUNDS = 20_000;
/** The same for PBKDF2, which the browser runs natively and so can do far more of. */
export const PBKDF2_ROUNDS = 600_000;
/** After this many wrong tries in a row, the PIN can't be tried again for a while. */
export const MAX_TRIES = 5;
export const LOCK_MS = 60_000;

interface StoredPin {
  /** How the key is made from the PIN. Missing on PINs made with the SHA-256 in this file. */
  kdf?: 'pbkdf2';
  /** How many rounds of it, so the number can be raised later without losing the PINs there are. */
  rounds?: number;
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

// SHA-256, written out because crypto.subtle only exists on https and localhost, and Jellyfied is
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

/** The browser's cryptography, where there is any: only on https and localhost. */
const subtle = (): SubtleCrypto | undefined => globalThis.crypto?.subtle;

/** The same as `derive`, by PBKDF2: half of what comes out recognises the PIN, the other half is the key. */
async function derivePbkdf2(pin: string, salt: string, rounds: number): Promise<{ hash: string; key: CryptoKey }> {
  const api = subtle()!;
  const material = await api.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(
    await api.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(salt), iterations: rounds }, material, 512),
  );
  const key = await api.importKey('raw', bits.slice(32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { hash: toHex(bits.slice(0, 32)), key };
}

/** A new record for a PIN, with the token locked away in the strongest way this browser has. */
async function seal(pin: string, accessToken: string): Promise<StoredPin> {
  const text = new TextEncoder().encode(accessToken);
  const api = subtle();
  if (!api) {
    const salt = toHex(crypto.getRandomValues(new Uint8Array(12)));
    const { hash, key } = derive(pin, salt);
    return { salt, hash, token: toHex(crypt(text, key)) };
  }
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const { hash, key } = await derivePbkdf2(pin, salt, PBKDF2_ROUNDS);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await api.encrypt({ name: 'AES-GCM', iv }, key, text));
  return { kdf: 'pbkdf2', rounds: PBKDF2_ROUNDS, salt, hash, token: toHex(iv) + toHex(sealed) };
}

/** Tries a PIN on a record: whether it is the right one, and the token it locked away. */
async function open(saved: StoredPin, pin: string): Promise<{ ok: boolean; accessToken?: string }> {
  if (saved.kdf !== 'pbkdf2') {
    const { hash, key } = derive(pin, saved.salt);
    if (hash !== saved.hash) return { ok: false };
    return { ok: true, accessToken: saved.token ? new TextDecoder().decode(crypt(fromHex(saved.token), key)) : undefined };
  }
  const api = subtle();
  // Made where the browser had its cryptography, read where it has none: not something a browser
  // does to one site, and nothing can be done with the record here.
  if (!api) return { ok: false };
  const { hash, key } = await derivePbkdf2(pin, saved.salt, saved.rounds ?? PBKDF2_ROUNDS);
  if (hash !== saved.hash) return { ok: false };
  if (!saved.token) return { ok: true };
  const bytes = fromHex(saved.token);
  try {
    const plain = await api.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12));
    return { ok: true, accessToken: new TextDecoder().decode(plain) };
  } catch {
    // The stored token was changed: the PIN is right, but there is nothing to sign in with.
    return { ok: false };
  }
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
export async function setPin(account: Pick<StoredSession, 'serverUrl' | 'userId'>, pin: string, accessToken: string): Promise<void> {
  const record = await seal(pin, accessToken);
  store({ ...load(), [idOf(account)]: record });
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
export async function checkPin(account: Pick<StoredSession, 'serverUrl' | 'userId'>, pin: string, now = Date.now()): Promise<PinCheck> {
  const id = idOf(account);
  const saved = load()[id];
  if (!saved?.hash) return { ok: true };
  if (saved.lockedUntil && saved.lockedUntil > now) return { ok: false, lockedFor: saved.lockedUntil - now };
  const result = await open(saved, pin);
  // Read again: working out the key takes a moment, and another tab may have written meanwhile.
  const pins = load();
  if (result.ok) {
    const kept: StoredPin = { kdf: saved.kdf, rounds: saved.rounds, salt: saved.salt, hash: saved.hash, token: saved.token };
    // A PIN from before the browser's cryptography was used, entered where it exists: lock the token away again with it.
    const upgraded = saved.kdf !== 'pbkdf2' && subtle() && result.accessToken !== undefined ? await seal(pin, result.accessToken) : kept;
    store({ ...pins, [id]: upgraded });
    return { ok: true, accessToken: result.accessToken };
  }
  const tries = (saved.lockedUntil ? 0 : (saved.tries ?? 0)) + 1;
  const locked = tries >= MAX_TRIES;
  store({ ...pins, [id]: { ...saved, tries: locked ? 0 : tries, lockedUntil: locked ? now + LOCK_MS : undefined } });
  return locked ? { ok: false, lockedFor: LOCK_MS } : { ok: false, triesLeft: MAX_TRIES - tries };
}
