import { useEffect, useSyncExternalStore } from 'react';
import type { JellyfinApi } from '@/api/client';
import { useApi, useSession } from '@/auth/AuthProvider';
import { onPrefChanged, prefPulled } from './prefsBus';

/**
 * Preferences that follow the user to other browsers. They are kept in local storage as before,
 * and mirrored to the "display preferences" Jellyfin stores per user and client. Streaming quality,
 * poster size and volume describe a device, not a person, and stay local.
 */
export const SYNCED_KEYS = [
  'jellyplex.theme',
  'jellyplex.subtitleStyle',
  'jellyplex.seekSteps',
  'jellyplex.timeFormat',
  'jellyplex.home',
  'jellyplex.trackMemory',
  'jellyplex.language',
];

const ENABLED_KEY = 'jellyplex.syncPrefs';
const PREFS_ID = 'usersettings';
const CLIENT = 'jellyplex';
const PUSH_DELAY = 1500;
const REFRESH_AFTER = 5 * 60_000;

interface DisplayPreferences {
  CustomPrefs?: Record<string, string | null> | null;
  [key: string]: unknown;
}

function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'off';
  } catch {
    return true;
  }
}

let enabled = readEnabled();
const enabledListeners = new Set<() => void>();

export function setPrefsSyncEnabled(value: boolean) {
  enabled = value;
  try {
    if (value) localStorage.removeItem(ENABLED_KEY);
    else localStorage.setItem(ENABLED_KEY, 'off');
  } catch {
    /* ignore */
  }
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
  for (const key of SYNCED_KEYS) {
    try {
      out[key] = localStorage.getItem(key);
    } catch {
      out[key] = null;
    }
  }
  return out;
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
      const fetched = await api.get<DisplayPreferences>(`/DisplayPreferences/${PREFS_ID}`, query);
      if (stopped || !fetched || typeof fetched !== 'object') return;
      dto = fetched;
      pulledAt = Date.now();
      const { apply, push: needsPush } = mergePrefs(fetched.CustomPrefs ?? {}, readLocal());
      for (const [key, value] of Object.entries(apply)) {
        try {
          localStorage.setItem(key, value);
        } catch {
          continue;
        }
        prefPulled(key);
      }
      if (needsPush) schedulePush();
    } catch {
      /* offline, or a server without this endpoint: the preferences simply stay local */
    }
  };

  void pull();
  const offChanged = onPrefChanged((key) => {
    if (SYNCED_KEYS.includes(key)) schedulePush();
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
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** Keeps the synced preferences in step with the signed-in user's account. Renders nothing. */
export function PrefsSync() {
  const api = useApi();
  const { userId } = useSession();
  const [on] = usePrefsSyncEnabled();
  useEffect(() => {
    if (!on) return;
    return start(api, userId);
  }, [api, userId, on]);
  return null;
}
