import clsx from 'clsx';
import { LogOut, Play, Plus, Users } from 'lucide-react';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { generateId } from '@/api/device';
import { useAuth, useCurrentUser, useSession } from '@/auth/AuthProvider';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useSocket } from '@/realtime/RealtimeProvider';
import { getActiveVideo } from './activePlayer';
import { SyncPlayManager, type SyncPlaySnapshot } from './syncplay';
import type { VideoPlayerState } from './usePlay';
import { isPlayPath } from './VideoSession';

const SyncPlayContext = createContext<SyncPlayManager | null>(null);

const NOT_IN_GROUP: SyncPlaySnapshot = { group: null, hasQueue: false, following: false, playlistItemId: null };
const noopSubscribe = () => () => {};

/** Creates the SyncPlay manager while signed in, and connects it to navigation and toasts. */
export function SyncPlayProvider({ children }: { children: ReactNode }) {
  const { api } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const toast = useToast();
  const [manager, setManager] = useState<SyncPlayManager | null>(null);

  const ctx = useRef({ navigate, toast });
  useLayoutEffect(() => {
    ctx.current = { navigate, toast };
  });

  // The manager lives as long as the connection does, and reaches the rest of the app through state.
  // oxlint-disable react/set-state-in-effect
  useEffect(() => {
    if (!api || !socket) {
      setManager(null);
      return;
    }
    const m = new SyncPlayManager(api, socket);
    m.onOpen = (req) => {
      const state: VideoPlayerState = {
        token: generateId(),
        queue: req.queue.length > 1 ? req.queue : undefined,
        startPositionTicks: req.startPositionTicks,
        syncPlaylistItemId: req.playlistItemId,
      };
      // Coming from another video: replace it, so Back doesn't return to (and restart) the old one.
      ctx.current.navigate(`/play/${req.itemId}`, { state, replace: isPlayPath(window.location.pathname) });
    };
    m.onStop = () => getActiveVideo()?.stop();
    m.onNotice = (n) => {
      const t = ctx.current.toast;
      if (n.type === 'joined') t.info(`${n.user} joined the SyncPlay group`);
      else if (n.type === 'left') t.info(`${n.user} left the SyncPlay group`);
      else if (n.type === 'error') t.error(n.message);
      else if (n.type === 'info') t.info(n.message);
    };
    setManager(m);
    return () => m.dispose();
  }, [api, socket]);
  // oxlint-enable react/set-state-in-effect

  return <SyncPlayContext.Provider value={manager}>{children}</SyncPlayContext.Provider>;
}

export function useSyncPlayManager(): SyncPlayManager | null {
  return useContext(SyncPlayContext);
}

export function useSyncPlay(): SyncPlaySnapshot {
  const manager = useContext(SyncPlayContext);
  return useSyncExternalStore(manager?.subscribe ?? noopSubscribe, manager?.getSnapshot ?? (() => NOT_IN_GROUP), () => NOT_IN_GROUP);
}

const STATE_LABEL: Record<string, string> = {
  Idle: 'Nothing playing',
  Waiting: 'Waiting for everyone',
  Paused: 'Paused',
  Playing: 'Playing',
};

/** Top-bar button to create, join or leave a SyncPlay group. */
export function SyncPlayButton() {
  const manager = useSyncPlayManager();
  const sync = useSyncPlay();
  const { data: user } = useCurrentUser();
  const session = useSession();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const access = user?.Policy?.SyncPlayAccess ?? 'CreateAndJoinGroups';

  const groups = useQuery({
    queryKey: ['syncplay-groups'],
    queryFn: () => manager!.listGroups(),
    enabled: open && Boolean(manager) && !sync.group,
    refetchInterval: 3000,
    staleTime: 0,
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!manager || access === 'None') return null;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const row = 'flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-white/10 disabled:opacity-50';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="SyncPlay"
        title={sync.group ? `SyncPlay: ${sync.group.GroupName}` : 'SyncPlay: watch together'}
        className={clsx('rounded-full p-2 hover:bg-white/10', open || sync.group ? 'text-accent' : 'text-muted hover:text-fg')}
      >
        <Users size={20} />
      </button>
      {open && (
        <div
          className="animate-pop-in absolute top-12 right-0 z-50 w-80 max-w-[calc(100vw-1rem)] rounded-lg bg-base-750 py-2 shadow-2xl ring-1 ring-black/40"
          data-testid="syncplay-menu"
        >
          <div className="px-4 pt-1 pb-2 text-[11px] font-semibold tracking-wider text-faint uppercase">SyncPlay</div>
          {sync.group ? (
            <>
              <div className="px-4 pb-2">
                <div className="truncate font-semibold" data-testid="syncplay-group-name">
                  {sync.group.GroupName}
                </div>
                <div className="text-xs text-muted" data-testid="syncplay-state">
                  {STATE_LABEL[sync.group.State] ?? sync.group.State}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5" data-testid="syncplay-participants">
                  {sync.group.Participants.map((p, i) => (
                    <span key={`${p}-${i}`} className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs">
                      {p}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-faint">
                  {sync.hasQueue
                    ? 'Play, pause and seek apply to everyone in the group.'
                    : 'Play a movie or episode to start watching together.'}
                </p>
              </div>
              {sync.hasQueue && !sync.following && (
                <button
                  className={row}
                  onClick={() => {
                    manager.rejoinPlayback();
                    setOpen(false);
                  }}
                >
                  <Play size={16} className="shrink-0 text-accent" /> Join playback
                </button>
              )}
              <button
                className={row}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await manager.leaveGroup();
                    setOpen(false);
                  })
                }
              >
                <LogOut size={16} className="shrink-0 text-muted" /> Leave group
              </button>
            </>
          ) : (
            <>
              {access === 'CreateAndJoinGroups' && (
                <button
                  className={row}
                  disabled={busy}
                  onClick={() => void run(() => manager.createGroup(`${user?.Name ?? session.userName}'s group`))}
                >
                  <Plus size={16} className="shrink-0 text-accent" /> Create a group
                </button>
              )}
              {groups.isLoading ? (
                <div className="flex justify-center py-4 text-accent">
                  <Spinner size={20} />
                </div>
              ) : (groups.data ?? []).length === 0 ? (
                <p className="px-4 py-3 text-xs text-faint">
                  No groups to join yet. Create one, then others on this server can join it from this menu.
                </p>
              ) : (
                groups.data!.map((g) => (
                  <button
                    key={g.GroupId}
                    className={row}
                    disabled={busy}
                    data-testid="syncplay-group"
                    onClick={() => void run(() => manager.joinGroup(g.GroupId))}
                  >
                    <Users size={16} className="shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{g.GroupName}</span>
                      <span className="block truncate text-xs text-muted">{g.Participants.join(', ')}</span>
                    </span>
                  </button>
                ))
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
