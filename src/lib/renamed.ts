/**
 * Jellyfied was called Jellyplex up to version 1.2.0 and kept what it stores in the browser under
 * that name. This moves it over once, so nobody is signed out or loses settings by updating.
 * It has to run before anything reads the storage, so main.tsx imports it first.
 */
const OLD = 'jellyplex.';
const NEW = 'jellyfied.';

export function moveOldStorage(storage: Storage) {
  const old: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(OLD)) old.push(key);
  }
  for (const key of old) {
    const renamed = NEW + key.slice(OLD.length);
    const value = storage.getItem(key);
    if (value !== null && storage.getItem(renamed) === null) storage.setItem(renamed, value);
    storage.removeItem(key);
  }
}

/** The name a synced preference had on the account before the rename. */
export const oldPrefKey = (key: string) => (key.startsWith(NEW) ? OLD + key.slice(NEW.length) : key);

for (const storage of ['localStorage', 'sessionStorage'] as const) {
  try {
    moveOldStorage(window[storage]);
  } catch {
    /* storage is blocked: there is nothing to move */
  }
}
