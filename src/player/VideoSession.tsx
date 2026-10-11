import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { generateId } from '@/api/device';
import type { VideoPlayerState } from './usePlay';
import { stripBasePath } from '@/lib/basePath';

/**
 * The video player lives at app level (outside the routes) so playback survives navigation.
 * On /play/:id it is full screen; anywhere else it collapses into a Plex-style mini player.
 */
export interface VideoSession {
  itemId: string;
  state: VideoPlayerState;
  /** Changes whenever a new playback is requested, which remounts the player. */
  key: string;
}

interface VideoSessionApi {
  session: VideoSession | null;
  mode: 'full' | 'mini';
  /** Start playing an item, or keep the current session if it is the same request. */
  start: (itemId: string, state?: VideoPlayerState) => void;
  /** Stop playback and remove the player. */
  close: () => void;
  /** Open the full-screen player for the current session. */
  expand: () => void;
  /** Leave the full-screen player while playback continues in the mini player. */
  minimize: () => void;
}

const VideoSessionContext = createContext<VideoSessionApi | null>(null);

/** True on the full-screen player's page. Takes a router path or the browser's own path. */
export const isPlayPath = (pathname: string) => stripBasePath(pathname).startsWith('/play/');

export function VideoSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<VideoSession | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { session: auth } = useAuth();
  const mode = isPlayPath(location.pathname) ? 'full' : 'mini';

  // Signing out ends playback.
  if (!auth && session) setSession(null);

  const start = useCallback((itemId: string, state: VideoPlayerState = {}) => {
    setSession((prev) => {
      // Same item and no new play request (e.g. expanding the mini player): keep playing.
      if (prev && prev.itemId === itemId && (!state.token || state.token === prev.key)) return prev;
      return { itemId, state, key: state.token ?? generateId() };
    });
  }, []);

  const close = useCallback(() => setSession(null), []);

  const expand = useCallback(() => {
    if (session) navigate(`/play/${session.itemId}`);
  }, [session, navigate]);

  const minimize = useCallback(() => {
    if (!isPlayPath(window.location.pathname)) return;
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(session ? `/item/${session.itemId}` : '/', { replace: true });
  }, [navigate, session]);

  const value = useMemo(
    () => ({ session, mode, start, close, expand, minimize }) as VideoSessionApi,
    [session, mode, start, close, expand, minimize],
  );

  return <VideoSessionContext.Provider value={value}>{children}</VideoSessionContext.Provider>;
}

export function useVideoSession(): VideoSessionApi {
  const ctx = useContext(VideoSessionContext);
  if (!ctx) throw new Error('useVideoSession must be used inside VideoSessionProvider');
  return ctx;
}

/** Route element for /play/:id. Starts the session; the global player renders full screen on top. */
export function PlayRoute() {
  const { id } = useParams();
  const location = useLocation();
  const { start } = useVideoSession();
  useEffect(() => {
    if (id) start(id, (location.state ?? {}) as VideoPlayerState);
    // location.key changes for every navigation, including repeated plays of the same item.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [id, location.key, location.state, start]);
  return <div className="fixed inset-0 bg-black" />;
}
