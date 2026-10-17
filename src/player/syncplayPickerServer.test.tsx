import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JellyfinApi } from '@/api/client';
import { renderHook } from '@/test/renderHook';

const PROXIED = 'https://media.example/jellyfin';
let api: JellyfinApi | null = null;

vi.mock('@/config', async (original) => ({
  ...(await original<typeof import('@/config')>()),
  runtimeConfig: { serverUrl: 'https://media.example/jellyfin', lockServer: true },
}));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ api }) }));

const { usePickerSupported } = await import('./syncplayPickerApi');

/** Answers /System/Info/Public with the server id each address belongs to. */
function servers(ids: Record<string, string>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const base = Object.keys(ids).find((b) => String(url).startsWith(b));
      return new Response(JSON.stringify({ Id: base ? ids[base] : undefined }), { headers: { 'Content-Type': 'application/json' } });
    }),
  );
}

async function supported() {
  const client = new QueryClient();
  const { result, unmount } = renderHook(() => usePickerSupported(), {
    wrapper: (children) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
  unmount();
  return result.current;
}

afterEach(() => vi.unstubAllGlobals());

describe('whether the picker can be used', () => {
  it('can at the address the container proxies', async () => {
    api = new JellyfinApi(PROXIED, 'token', 'user');
    servers({});
    expect(await supported()).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('can with a session saved under another address of the same server', async () => {
    api = new JellyfinApi('https://direct.example:8096', 'token', 'user');
    servers({ [PROXIED]: 'server-1', 'https://direct.example:8096': 'server-1' });
    expect(await supported()).toBe(true);
  });

  it('cannot with a session on another server', async () => {
    api = new JellyfinApi('https://elsewhere.example', 'token', 'user');
    servers({ [PROXIED]: 'server-1', 'https://elsewhere.example': 'server-2' });
    expect(await supported()).toBe(false);
  });
});
