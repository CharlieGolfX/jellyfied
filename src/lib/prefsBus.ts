/**
 * Connects the small preference stores (colours, subtitle look, skip lengths…) with the part
 * that keeps them in step with the user's Jellyfin account (PrefsSync). A store says when it
 * wrote a new value, and is told when a newer value arrived from the server.
 */
type Listener = (key: string) => void;

const changed = new Set<Listener>();
const pulled = new Map<string, Set<() => void>>();

/** Called by a store after it saved a value the user just chose. */
export function prefChanged(key: string) {
  changed.forEach((l) => l(key));
}

export function onPrefChanged(listener: Listener): () => void {
  changed.add(listener);
  return () => changed.delete(listener);
}

/** Called after a value from the account was written to local storage: the store reads it again. */
export function prefPulled(key: string) {
  pulled.get(key)?.forEach((l) => l());
}

export function onPrefPulled(key: string, listener: () => void): () => void {
  let set = pulled.get(key);
  if (!set) pulled.set(key, (set = new Set()));
  set.add(listener);
  return () => set.delete(listener);
}

const flushers = new Set<() => Promise<void>>();

/** The part that sends preferences to the account says how to send what is waiting right away. */
export function onFlushPrefs(flush: () => Promise<void>): () => void {
  flushers.add(flush);
  return () => flushers.delete(flush);
}

/** Sends changed preferences to the account now instead of in a moment. For just before the page is reloaded. */
export async function flushPrefs(): Promise<void> {
  await Promise.all(Array.from(flushers, (flush) => flush().catch(() => {})));
}
