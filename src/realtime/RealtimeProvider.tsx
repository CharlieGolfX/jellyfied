import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import type { JellyfinApi } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { JellyfinSocket } from './socket';

// The connection lives outside React: the provider opens and closes it, and whoever needs it
// reads it from here and is told when it changes.
let current: JellyfinSocket | null = null;
const listeners = new Set<() => void>();

function setCurrent(socket: JellyfinSocket | null) {
  current = socket;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * The app name of this browser's session on the server, read from the session the WebSocket is in.
 * Jellyfin files that session under the name the token was issued under, which for a sign-in from
 * before the rename is the old one; requests under another name would make a second session, which
 * SyncPlay and remote control messages never reach.
 */
export async function socketClientName(api: JellyfinApi): Promise<string | null> {
  const sessions = await api.get<{ Client?: string; SupportsRemoteControl?: boolean }[]>('/Sessions', { deviceId: api.deviceId });
  return sessions.find((s) => s.SupportsRemoteControl && s.Client)?.Client ?? null;
}

/** Keeps one WebSocket to the server open while signed in. */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { api, session, setClientName } = useAuth();
  const knowsClient = Boolean(session?.client);

  useEffect(() => {
    if (!api) return;
    const socket = new JellyfinSocket(api);
    setCurrent(socket);
    let timer: number | undefined;
    let checked = knowsClient;
    // Once per sign-in, when it is not known what name the token was issued under.
    const stopChecking = socket.onOpen(() => {
      if (checked) return;
      checked = true;
      // The server files the WebSocket in a session just after accepting it.
      timer = window.setTimeout(() => {
        socketClientName(api)
          .then((name) => name && setClientName(name))
          .catch(() => {});
      }, 1500);
    });
    return () => {
      stopChecking();
      window.clearTimeout(timer);
      socket.close();
      if (current === socket) setCurrent(null);
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- only for a new client, not when the name is saved
  }, [api]);

  return children;
}

/** The live connection, or null while signed out. */
export function useSocket(): JellyfinSocket | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
