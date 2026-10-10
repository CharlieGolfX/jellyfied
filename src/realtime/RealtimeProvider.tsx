import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { JellyfinSocket } from './socket';

const SocketContext = createContext<JellyfinSocket | null>(null);

/** Keeps one WebSocket to the server open while signed in. */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { api } = useAuth();
  const [socket, setSocket] = useState<JellyfinSocket | null>(null);

  useEffect(() => {
    if (!api) {
      setSocket(null);
      return;
    }
    const s = new JellyfinSocket(api);
    setSocket(s);
    return () => s.close();
  }, [api]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

/** The live connection, or null while signed out. */
export function useSocket(): JellyfinSocket | null {
  return useContext(SocketContext);
}
