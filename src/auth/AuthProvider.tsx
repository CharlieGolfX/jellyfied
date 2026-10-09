import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { JellyfinApi } from '@/api/client';
import type { AuthenticationResult, UserDto } from '@/api/types';

const SESSION_KEY = 'jellyplex.session';
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
  const queryClient = useQueryClient();

  const api = useMemo(
    () => (session ? new JellyfinApi(session.serverUrl, session.accessToken, session.userId) : null),
    [session],
  );

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    setSession(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    if (api) api.onUnauthorized = clear;
  }, [api, clear]);

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
      queryClient.clear();
      queryClient.setQueryData(['me', result.User.Id], result.User);
      setSession(next);
    },
    [queryClient],
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

  const value = useMemo(() => ({ session, api, completeLogin, logout }), [session, api, completeLogin, logout]);
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
