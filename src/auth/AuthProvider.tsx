import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { JellyfinApi } from '@/api/client';
import type { AuthenticationResult, UserDto } from '@/api/types';
import { appPath } from '@/lib/basePath';
import { clearPin } from './accountPin';

const SESSION_KEY = 'jellyplex.session';
/** Every account signed in on this browser, the current one included, so users can switch without a password (see accountPin). */
const ACCOUNTS_KEY = 'jellyplex.accounts';
export const LAST_SERVER_KEY = 'jellyplex.lastServer';

export interface StoredSession {
  serverUrl: string;
  serverId: string;
  serverName: string;
  userId: string;
  userName: string;
  accessToken: string;
}

interface AuthState {
  session: StoredSession | null;
  api: JellyfinApi | null;
  completeLogin: (serverUrl: string, serverName: string, result: AuthenticationResult) => void;
  logout: () => Promise<void>;
  /** The other accounts that are signed in on this browser. */
  otherAccounts: StoredSession[];
  /** Continues as another signed-in account. Reloads the app, so nothing of the previous user lingers. */
  switchAccount: (account: StoredSession) => void;
  /** Leaves the current account signed in and opens the sign-in screen for another one. */
  addAccount: () => void;
  /** Signs a saved account out and forgets it. */
  forgetAccount: (account: StoredSession) => Promise<void>;
}

export const sameAccount = (a: StoredSession, b: StoredSession) => a.userId === b.userId && a.serverUrl === b.serverUrl;

function validSession(s: unknown): s is StoredSession {
  const v = s as Partial<StoredSession> | null;
  return Boolean(v && typeof v === 'object' && v.accessToken && v.serverUrl && v.userId);
}

/** The saved accounts with `account` added or replaced (newest first), or removed. */
export function withAccount(accounts: StoredSession[], account: StoredSession, remove = false): StoredSession[] {
  const rest = accounts.filter((a) => !sameAccount(a, account));
  return remove ? rest : [account, ...rest];
}

export function loadAccounts(): StoredSession[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(validSession) : [];
  } catch {
    return [];
  }
}

function saveAccounts(accounts: StoredSession[]) {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    /* ignore */
  }
}

const AuthContext = createContext<AuthState | null>(null);

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    return parsed.accessToken && parsed.serverUrl && parsed.userId ? parsed : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(loadSession);
  const [accounts, setAccounts] = useState<StoredSession[]>(() => {
    // A session from before accounts were remembered counts as the first one.
    const saved = loadAccounts();
    const current = loadSession();
    return current && !saved.some((a) => sameAccount(a, current)) ? [current, ...saved] : saved;
  });
  const queryClient = useQueryClient();

  const updateAccounts = useCallback((change: (accounts: StoredSession[]) => StoredSession[]) => {
    setAccounts((prev) => {
      const next = change(prev);
      saveAccounts(next);
      return next;
    });
  }, []);

  /** What to do when the server rejects the token; set further down, once `clear` exists. */
  const unauthorized = useRef<() => void>(() => {});
  const api = useMemo(() => {
    if (!session) return null;
    const client = new JellyfinApi(session.serverUrl, session.accessToken, session.userId);
    client.onUnauthorized = () => unauthorized.current();
    return client;
  }, [session]);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    // The token is gone or no longer valid, so the account can't be switched to any more either.
    if (session) {
      updateAccounts((list) => withAccount(list, session, true));
      clearPin(session);
    }
    setSession(null);
    queryClient.clear();
  }, [queryClient, session, updateAccounts]);

  useEffect(() => {
    unauthorized.current = clear;
  }, [clear]);

  const completeLogin = useCallback(
    (serverUrl: string, serverName: string, result: AuthenticationResult) => {
      const next: StoredSession = {
        serverUrl,
        serverId: result.ServerId,
        serverName,
        userId: result.User.Id,
        userName: result.User.Name,
        accessToken: result.AccessToken,
      };
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(next));
        localStorage.setItem(LAST_SERVER_KEY, serverUrl);
      } catch {
        /* ignore */
      }
      updateAccounts((list) => withAccount(list, next));
      queryClient.clear();
      queryClient.setQueryData(['me', result.User.Id], result.User);
      setSession(next);
    },
    [queryClient, updateAccounts],
  );

  const logout = useCallback(async () => {
    if (api) {
      try {
        await api.post('/Sessions/Logout');
      } catch {
        /* token may already be invalid */
      }
    }
    clear();
  }, [api, clear]);

  const switchAccount = useCallback((account: StoredSession) => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(account));
    } catch {
      return;
    }
    window.location.assign(appPath('/'));
  }, []);

  const addAccount = useCallback(() => {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      return;
    }
    window.location.assign(appPath('/login'));
  }, []);

  const forgetAccount = useCallback(
    async (account: StoredSession) => {
      try {
        await new JellyfinApi(account.serverUrl, account.accessToken, account.userId).post('/Sessions/Logout');
      } catch {
        /* token may already be invalid */
      }
      updateAccounts((list) => withAccount(list, account, true));
      clearPin(account);
    },
    [updateAccounts],
  );

  const otherAccounts = useMemo(() => accounts.filter((a) => !session || !sameAccount(a, session)), [accounts, session]);

  const value = useMemo(
    () => ({ session, api, completeLogin, logout, otherAccounts, switchAccount, addAccount, forgetAccount }),
    [session, api, completeLogin, logout, otherAccounts, switchAccount, addAccount, forgetAccount],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Authenticated API client. Only use below the authenticated route guard. */
export function useApi(): JellyfinApi {
  const { api } = useAuth();
  if (!api) throw new Error('useApi requires an authenticated session');
  return api;
}

export function useSession(): StoredSession {
  const { session } = useAuth();
  if (!session) throw new Error('useSession requires an authenticated session');
  return session;
}

export function useCurrentUser() {
  const api = useApi();
  const session = useSession();
  return useQuery({
    queryKey: ['me', session.userId],
    queryFn: () => api.get<UserDto>('/Users/Me'),
    staleTime: 60_000,
  });
}

export function useIsAdmin(): boolean {
  const { data } = useCurrentUser();
  return Boolean(data?.Policy?.IsAdministrator);
}
