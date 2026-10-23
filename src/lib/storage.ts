/**
 * Local storage that never throws. Storage can be missing or refuse every call (some private
 * windows, sandboxed frames, a full quota), and one unguarded read is enough to stop the app from
 * starting; with these, a read gives nothing and a write is skipped instead.
 */

/** The stored text, or null when there is none or storage can't be read. */
export function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** The stored value, parsed; undefined when there is none, it isn't JSON, or storage can't be read. */
export function readJson(key: string): unknown {
  const raw = readString(key);
  if (raw == null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/** Stores the text, or with null removes the key. Says whether it was stored. */
export function writeString(key: string, value: string | null): boolean {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Stores the value as JSON. Says whether it was stored. */
export function writeJson(key: string, value: unknown): boolean {
  return writeString(key, JSON.stringify(value));
}
