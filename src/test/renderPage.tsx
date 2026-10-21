import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthProvider } from '@/auth/AuthProvider';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ToastProvider } from '@/components/ui/Toast';
import { AudioPlayerProvider } from '@/player/AudioPlayerProvider';
import { SyncPlayProvider } from '@/player/SyncPlayProvider';
import { VideoSessionProvider } from '@/player/VideoSession';
import { RealtimeProvider } from '@/realtime/RealtimeProvider';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export const SERVER = 'https://media.example';

/** What a fake server answers: a body for a path (without the query), or undefined for a 404. */
export type FakeServer = (path: string, init: RequestInit | undefined, url: URL) => unknown;

/**
 * Renders a page inside the app's providers, as the signed-in user `user-1` of a fake server, at `path`. Every request the page
 * makes goes to `server`; the requests are in `requests`. Wait for the page with `settle()`.
 */
export async function renderPage(
  element: ReactNode,
  { path = '/', route = '*', server }: { path?: string; route?: string; server: FakeServer },
) {
  localStorage.setItem('jellyfied.session', JSON.stringify({ serverUrl: SERVER, accessToken: 'token', userId: 'user-1' }));
  const requests: { method: string; path: string; body?: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(String(input));
      const p = url.pathname;
      requests.push({ method: init?.method ?? 'GET', path: p, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const body = server(p, init, url);
      if (body === undefined) return new Response('', { status: 404 });
      if (body === null) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
    }),
  );
  // jsdom lays nothing out, so there is never anything to report.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // The realtime connection: opened, and silent.
  vi.stubGlobal(
    'WebSocket',
    class extends EventTarget {
      readyState = 0;
      send() {}
      close() {}
    },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const crashes: unknown[] = [];
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <MemoryRouter initialEntries={[path]}>
            <ToastProvider>
              <RealtimeProvider>
                <AudioPlayerProvider>
                  <VideoSessionProvider>
                    <SyncPlayProvider>
                      <ErrorBoundary
                        fallback={(error) => {
                          crashes.push(error);
                          return <p>crashed</p>;
                        }}
                      >
                        <Routes>
                          <Route path={route} element={element} />
                        </Routes>
                      </ErrorBoundary>
                    </SyncPlayProvider>
                  </VideoSessionProvider>
                </AudioPlayerProvider>
              </RealtimeProvider>
            </ToastProvider>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    ),
  );
  /** Lets the queries answer and the page render what came back. */
  const settle = async () => {
    for (let i = 0; i < 5; i++) await act(async () => new Promise((r) => setTimeout(r, 10)));
  };
  await settle();
  return {
    container,
    requests,
    crashes,
    settle,
    text: () => container.textContent ?? '',
    unmount: () => {
      act(() => root.unmount());
      container.remove();
      client.clear();
    },
  };
}
