import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, JellyfinApi } from '@/api/client';
import type { AuthenticationResult, UserDto } from '@/api/types';
import { appPath } from '@/lib/basePath';
import { forgetLocalPrefs } from '@/lib/prefsSync';
import { clearPin, setPin } from './accountPin';
import { readJson, writeJson, writeString } from '@/lib/storage';

const SESSION_KEY = 'jellyfied.session';
/** Every account signed in on this browser, the current one included, so users can switch without a password (see accountPin). */
const ACCOUNTS_KEY = 'jellyfied.accounts';
export const LAST_SERVER_KEY = 'jellyfied.lastServer';

export interface StoredSession {
  serverUrl: string;
  serverId: string;
  serverName: string;
  userId: string;
  userName: string;
  /** Empty in the list of saved accounts when a PIN has locked it away (see accountPin). */
  accessToken: string;
  sealed?: boolean;
  /** The server stopped accepting its sign-in: it stays in the list, to be signed in again with the password. */
  expired?: boolean;
}

interface AuthState {
  session: StoredSession | null;
  api: JellyfinApi | null;
  completeLogin: (serverUrl: string, serverName: string, result: AuthenticationResult) => void;
  logout: () => Promise<void>;
  /** The other accounts that are signed in on this browser. */
  otherAccounts: StoredSession[];
  /**
   * Continues as another signed-in account. Reloads the app, so nothing of the previous user lingers.
   * An account protected by a PIN needs the access token its PIN gave back.
   */
  switchAccount: (account: StoredSession, accessToken?: string) => void;
  /** Sets (or with null, removes) the PIN of the account in use, and locks or frees its saved sign-in. */
  protectAccount: (pin: string | null) => Promise<void>;
  /** Leaves the current account signed in and opens the sign-in screen for another one. */
  addAccount: () => void;
  /** Signs a saved account out and forgets it. */
  forgetAccount: (account: StoredSession) => Promise<void>;
}

export const sameAccount = (a: StoredSession, b: StoredSession) => a.userId === b.userId && a.serverUrl === b.serverUrl;

function validSession(s: unknown): s is StoredSession {
  const v = s as Partial<StoredSession> | null;
  return Boolean(v && typeof v === 'object' && (v.accessToken || v.sealed || v.expired) && v.serverUrl && v.userId);
}

/** The saved accounts with `account` added or replaced (newest first), or removed. */
export function withAccount(accounts: StoredSession[], account: StoredSession, remove = false): StoredSession[] {
  const rest = accounts.filter((a) => !sameAccount(a, account));
  return remove ? rest : [account, ...rest];
}

export function loadAccounts(): StoredSession[] {
  const parsed = readJson(ACCOUNTS_KEY);
  return Array.isArray(parsed) ? parsed.filter(validSession) : [];
}

function saveAccounts(accounts: StoredSession[]) {
  writeJson(ACCOUNTS_KEY, accounts);
}

const AuthContext = createContext<AuthState | null>(null);

function loadSession(): StoredSession | null {
  const parsed = readJson(SESSION_KEY) as Partial<StoredSession> | null | undefined;
  return parsed && typeof parsed === 'object' && parsed.accessToken && parsed.serverUrl && parsed.userId ? (parsed as StoredSession) : null;
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

  /** What to do when the server rejects the token; set further down, once `expire` exists. */
  const unauthorized = useRef<() => void>(() => {});
  const api = useMemo(() => {
    if (!session) return null;
    const client = new JellyfinApi(session.serverUrl, session.accessToken, session.userId);
    client.onUnauthorized = () => unauthorized.current();
    return client;
  }, [session]);

  /** Ends the session. Signing out forgets the account; a token the server rejected leaves it listed. */
  const clear = useCallback(
    (forget: boolean) => {
      writeString(SESSION_KEY, null);
      // The token is gone or no longer valid, so the account can't be switched to without a password any more.
      if (session) {
        const expired: StoredSession = { ...session, accessToken: '', sealed: undefined, expired: true };
        updateAccounts((list) => (forget ? withAccount(list, session, true) : list.map((a) => (sameAccount(a, session) ? expired : a))));
        clearPin(session);
      }
      setSession(null);
      queryClient.clear();
    },
    [queryClient, session, updateAccounts],
  );

  // One request turned away can be something in front of Jellyfin (a proxy, forward authentication)
  // or one misbehaving endpoint: only when the server also says no to "who am I" is the token dead.
  const checking = useRef(false);
  const expire = useCallback(async () => {
    if (!session || checking.current) return;
    checking.current = true;
    try {
      await new JellyfinApi(session.serverUrl, session.accessToken, session.userId).get('/Users/Me');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) clear(false);
    } finally {
      checking.current = false;
    }
  }, [session, clear]);

  useEffect(() => {
    unauthorized.current = () => void expire();
  }, [expire]);

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
      writeJson(SESSION_KEY, next);
      writeString(LAST_SERVER_KEY, serverUrl);
      updateAccounts((list) => withAccount(list, next));
      // Signing in with the password again starts over: the PIN locked away the previous sign-in.
      clearPin(next);
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
    clear(true);
  }, [api, clear]);

  const switchAccount = useCallback((account: StoredSession, accessToken?: string) => {
    const token = accessToken ?? account.accessToken;
    if (!token) {
      if (!account.expired) return;
      // Signed in again with the password, on the sign-in screen.
      if (!writeString(SESSION_KEY, null)) return;
      writeString(LAST_SERVER_KEY, account.serverUrl);
      window.location.assign(`${appPath('/login')}?user=${encodeURIComponent(account.userName)}`);
      return;
    }
    // The session in use has its token in the clear; the saved account keeps it locked away.
    if (!writeJson(SESSION_KEY, { ...account, accessToken: token, sealed: undefined })) return;
    window.location.assign(appPath('/'));
  }, []);

  const protectAccount = useCallback(
    async (pin: string | null) => {
      if (!session) return;
      if (pin) await setPin(session, pin, session.accessToken);
      else clearPin(session);
      const saved: StoredSession = pin ? { ...session, accessToken: '', sealed: true } : { ...session, sealed: undefined };
      updateAccounts((list) => list.map((a) => (sameAccount(a, session) ? saved : a)));
    },
    [session, updateAccounts],
  );

  const addAccount = useCallback(() => {
    if (!writeString(SESSION_KEY, null)) return;
    window.location.assign(appPath('/login'));
  }, []);

  const forgetAccount = useCallback(
    async (account: StoredSession) => {
      // A sign-in that a PIN has locked away can't be ended on the server from here; it is only forgotten.
      if (account.accessToken) {
        try {
          await new JellyfinApi(account.serverUrl, account.accessToken, account.userId).post('/Sessions/Logout');
        } catch {
          /* token may already be invalid */
        }
      }
      updateAccounts((list) => withAccount(list, account, true));
      clearPin(account);
      forgetLocalPrefs(account.userId);
    },
    [updateAccounts],
  );

  const otherAccounts = useMemo(() => accounts.filter((a) => !session || !sameAccount(a, session)), [accounts, session]);

  const value = useMemo(
    () => ({ session, api, completeLogin, logout, otherAccounts, switchAccount, protectAccount, addAccount, forgetAccount }),
    [session, api, completeLogin, logout, otherAccounts, switchAccount, protectAccount, addAccount, forgetAccount],
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
