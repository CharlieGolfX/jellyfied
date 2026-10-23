import { useEffect, useSyncExternalStore } from 'react';
import type { JellyfinApi } from '@/api/client';
import { useApi, useSession } from '@/auth/AuthProvider';
import { onFlushPrefs, onPrefChanged, prefPulled } from './prefsBus';
import { readJson, readString, writeJson, writeString } from '@/lib/storage';

/**
 * Preferences that follow the user to other browsers. They are kept in local storage as before,
 * and mirrored to the "display preferences" Jellyfin stores per user and client. Streaming quality,
 * poster size and volume describe a device, not a person, and stay local.
 */
export const SYNCED_KEYS = [
  'jellyfied.theme',
  'jellyfied.subtitleStyle',
  'jellyfied.seekSteps',
  'jellyfied.timeFormat',
  'jellyfied.home',
  'jellyfied.trackMemory',
  'jellyfied.language',
];

const ENABLED_KEY = 'jellyfied.syncPrefs';
/** The user the synced keys in local storage belong to. */
const OWNER_KEY = 'jellyfied.prefsOwner';
/** Where another user's synced keys wait while someone else uses this browser. */
const PARKED_PREFIX = 'jellyfied.prefsOf.';
const PREFS_ID = 'usersettings';
const CLIENT = 'jellyfied';
const PUSH_DELAY = 1500;
const REFRESH_AFTER = 5 * 60_000;

interface DisplayPreferences {
  CustomPrefs?: Record<string, string | null> | null;
  [key: string]: unknown;
}

let enabled = readString(ENABLED_KEY) !== 'off';
const enabledListeners = new Set<() => void>();

export function setPrefsSyncEnabled(value: boolean) {
  enabled = value;
  writeString(ENABLED_KEY, value ? null : 'off');
  enabledListeners.forEach((l) => l());
}

export function usePrefsSyncEnabled(): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    (cb) => {
      enabledListeners.add(cb);
      return () => enabledListeners.delete(cb);
    },
    () => enabled,
    () => true,
  );
  return [value, setPrefsSyncEnabled];
}

/**
 * Compares the account's values with the local ones. The account wins where it has a value;
 * values that only exist locally are to be sent up.
 */
export function mergePrefs(
  remote: Record<string, string | null | undefined>,
  local: Record<string, string | null>,
  keys: string[] = SYNCED_KEYS,
): { apply: Record<string, string>; push: boolean } {
  const apply: Record<string, string> = {};
  let push = false;
  for (const key of keys) {
    const r = remote[key];
    const l = local[key];
    if (typeof r === 'string') {
      if (r !== l) apply[key] = r;
    } else if (l != null) {
      push = true;
    }
  }
  return { apply, push };
}

function readLocal(): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const key of SYNCED_KEYS) out[key] = readString(key);
  return out;
}

/**
 * Makes the synced keys in local storage those of `userId`. They are shared by everyone using the
 * browser, so when another user signs in, the previous user's values are put aside and this user's
 * own ones (if they used this browser before) come back. Without that, one profile's theme, home
 * layout and remembered tracks would show up for the next one and be sent up to their account.
 * Values from before owners were recorded count as the first user's. Returns the keys that changed.
 */
export function claimLocalPrefs(userId: string): string[] {
  const owner = readString(OWNER_KEY);
  // Nothing to swap, or storage that can't keep anything: then there is nothing to mix up either.
  if (owner === userId || !writeString(OWNER_KEY, userId)) return [];
  const current = readLocal();
  if (owner) writeJson(PARKED_PREFIX + owner, current);
  const parked = owner ? readJson(PARKED_PREFIX + userId) : current;
  const mine = (parked && typeof parked === 'object' ? parked : {}) as Record<string, unknown>;
  writeString(PARKED_PREFIX + userId, null);
  const changed: string[] = [];
  for (const key of SYNCED_KEYS) {
    const value = typeof mine[key] === 'string' ? mine[key] : null;
    if (value === current[key]) continue;
    writeString(key, value);
    changed.push(key);
  }
  return changed;
}

/** Drops what a forgotten account left put aside in this browser. */
export function forgetLocalPrefs(userId: string) {
  writeString(PARKED_PREFIX + userId, null);
}

function start(api: JellyfinApi, userId: string): () => void {
  const query = { userId, client: CLIENT };
  let dto: DisplayPreferences | null = null;
  let stopped = false;
  let timer: number | undefined;
  let pulledAt = 0;

  const push = async () => {
    if (!dto || stopped) return;
    const prefs: Record<string, string | null> = { ...dto.CustomPrefs };
    for (const [key, value] of Object.entries(readLocal())) {
      if (value == null) delete prefs[key];
      else prefs[key] = value;
    }
    dto = { ...dto, CustomPrefs: prefs };
    try {
      await api.post(`/DisplayPreferences/${PREFS_ID}`, dto, query);
    } catch {
      /* the next change tries again */
    }
  };
  const schedulePush = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void push(), PUSH_DELAY);
  };

  const pull = async () => {
    try {
      const fetched = await api.getInBackground<DisplayPreferences>(`/DisplayPreferences/${PREFS_ID}`, query);
      if (stopped || !fetched || typeof fetched !== 'object') return;
      dto = fetched;
      pulledAt = Date.now();
      const { apply, push: needsPush } = mergePrefs(fetched.CustomPrefs ?? {}, readLocal());
      for (const [key, value] of Object.entries(apply)) if (writeString(key, value)) prefPulled(key);
      if (needsPush) schedulePush();
    } catch {
      /* offline, or a server without this endpoint: the preferences simply stay local */
    }
  };

  void pull();
  const offChanged = onPrefChanged((key) => {
    if (SYNCED_KEYS.includes(key)) schedulePush();
  });
  const offFlush = onFlushPrefs(() => {
    window.clearTimeout(timer);
    return push();
  });
  // Coming back to a tab that sat in the background: another device may have changed something.
  const onVisible = () => {
    if (document.visibilityState === 'visible' && Date.now() - pulledAt > REFRESH_AFTER) void pull();
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    stopped = true;
    window.clearTimeout(timer);
    offChanged();
    offFlush();
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** Keeps the synced preferences in step with the signed-in user's account. Renders nothing. */
export function PrefsSync() {
  const api = useApi();
  const { userId } = useSession();
  const [on] = usePrefsSyncEnabled();
  useEffect(() => {
    claimLocalPrefs(userId).forEach(prefPulled);
    if (!on) return;
    return start(api, userId);
  }, [api, userId, on]);
  return null;
}
