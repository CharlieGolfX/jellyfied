import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticationResult } from '@/api/types';
import { AuthProvider, loadAccounts, useAuth, type StoredSession } from './AuthProvider';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SESSION_KEY = 'jellyfied.session';
const ACCOUNTS_KEY = 'jellyfied.accounts';

const saved = (userId: string, accessToken = `token-${userId}`): StoredSession => ({
  serverUrl: 'http://server:8096',
  serverId: 'server-1',
  serverName: 'Home',
  userId,
  userName: userId,
  accessToken,
});

const loginResult = (userId: string): AuthenticationResult =>
  ({ ServerId: 'server-1', AccessToken: `token-${userId}`, User: { Id: userId, Name: userId } }) as AuthenticationResult;

let host: HTMLDivElement;
let root: Root;
let auth: ReturnType<typeof useAuth>;
let fetchMock: ReturnType<typeof vi.fn>;

function Probe() {
  const value = useAuth();
  useEffect(() => {
    auth = value;
  });
  return null;
}

function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    ),
  );
}

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('AuthProvider', () => {
  it('is signed out without a saved session', () => {
    mount();
    expect(auth.session).toBeNull();
    expect(auth.api).toBeNull();
    expect(auth.otherAccounts).toEqual([]);
  });

  it('remembers the app name a sign-in was issued under, without starting the client over', () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(saved('ann')));
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([saved('ann')]));
    mount();
    const api = auth.api;
    act(() => auth.setClientName('Jellyplex'));
    expect(auth.api).toBe(api);
    expect(auth.api?.authorizationHeader()).toMatch(/^MediaBrowser Client="Jellyplex", /);
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)!).client).toBe('Jellyplex');
    expect(loadAccounts()[0].client).toBe('Jellyplex');

    // Next time the app starts, requests give that name from the first one.
    act(() => root.unmount());
    mount();
    expect(auth.api?.authorizationHeader()).toMatch(/^MediaBrowser Client="Jellyplex", /);
  });

  it('notes that a new sign-in is issued under this app’s name', () => {
    mount();
    act(() => auth.completeLogin('http://server:8096', 'Home', loginResult('ann')));
    expect(auth.session?.client).toBe('Jellyfied');
  });

  it('picks up a saved session, with an API client that carries its token', () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(saved('ann')));
    mount();
    expect(auth.session?.userId).toBe('ann');
    expect(auth.api?.accessToken).toBe('token-ann');
    expect(auth.api?.serverUrl).toBe('http://server:8096');
  });

  it('ignores a saved session that is broken or incomplete', () => {
    localStorage.setItem(SESSION_KEY, '{"serverUrl":"http://server:8096"}');
    mount();
    expect(auth.session).toBeNull();
  });

  it('counts a session from before accounts were remembered as the first account', () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(saved('ann')));
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([saved('bob')]));
    mount();
    expect(auth.otherAccounts.map((a) => a.userId)).toEqual(['bob']);
  });

  it('stores the session and the account after signing in', () => {
    mount();
    act(() => auth.completeLogin('http://server:8096', 'Home', loginResult('ann')));
    expect(auth.session).toMatchObject({ userId: 'ann', userName: 'ann', serverName: 'Home', accessToken: 'token-ann' });
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)!)).toMatchObject({ userId: 'ann' });
    expect(loadAccounts().map((a) => a.userId)).toEqual(['ann']);
    expect(localStorage.getItem('jellyfied.lastServer')).toBe('http://server:8096');
  });

  it('keeps the first account when a second one signs in, and lists it as the other account', () => {
    mount();
    act(() => auth.completeLogin('http://server:8096', 'Home', loginResult('ann')));
    act(() => auth.completeLogin('http://server:8096', 'Home', loginResult('bob')));
    expect(auth.session?.userId).toBe('bob');
    expect(auth.otherAccounts.map((a) => a.userId)).toEqual(['ann']);
    expect(loadAccounts().map((a) => a.userId)).toEqual(['bob', 'ann']);
  });

  it('signs out on the server, forgets the session and the account, and keeps the others', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(saved('ann')));
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([saved('ann'), saved('bob')]));
    mount();
    await act(() => auth.logout());
    expect(fetchMock).toHaveBeenCalledWith('http://server:8096/Sessions/Logout', expect.objectContaining({ method: 'POST' }));
    expect(auth.session).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(loadAccounts().map((a) => a.userId)).toEqual(['bob']);
  });

  it('still signs out here when the server cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    localStorage.setItem(SESSION_KEY, JSON.stringify(saved('ann')));
    mount();
    await act(() => auth.logout());
    expect(auth.session).toBeNull();
  });

  it('signs out when the server rejects the token', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));
    localStorage.setItem(SESSION_KEY, JSON.stringify(saved('ann')));
    mount();
    await act(async () => {
      await auth.api!.get('/Users/Me').catch(() => {});
    });
    expect(auth.session).toBeNull();
    expect(loadAccounts()).toEqual([]);
  });

  it('forgets another account and signs it out with its own token', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(saved('ann')));
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([saved('ann'), saved('bob')]));
    mount();
    await act(() => auth.forgetAccount(saved('bob')));
    const [, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(init.headers.Authorization).toContain('Token="token-bob"');
    expect(auth.otherAccounts).toEqual([]);
    expect(auth.session?.userId).toBe('ann');
  });
});
