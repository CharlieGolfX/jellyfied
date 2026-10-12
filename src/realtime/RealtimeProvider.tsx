import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
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

/** Keeps one WebSocket to the server open while signed in. */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { api } = useAuth();

  useEffect(() => {
    if (!api) return;
    const socket = new JellyfinSocket(api);
    setCurrent(socket);
    return () => {
      socket.close();
      if (current === socket) setCurrent(null);
    };
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
