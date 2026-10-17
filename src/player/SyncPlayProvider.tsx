import clsx from 'clsx';
import { Check, Dices, Lock, LogOut, Play, Plus, Trash2, Users } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { generateId } from '@/api/device';
import type { UserDto } from '@/api/types';
import { useApi, useAuth, useCurrentUser, useSession } from '@/auth/AuthProvider';
import { Avatar } from '@/components/layout/UserMenu';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useSocket } from '@/realtime/RealtimeProvider';
import { getActiveVideo } from './activePlayer';
import { SyncPlayManager, type SyncPlaySnapshot } from './syncplay';
import { canSeeGroup } from './syncplayInviteList';
import { setPickerOpen, usePicker, usePickerAction } from './syncplayPickerApi';
import type { VideoPlayerState } from './usePlay';
import { isPlayPath } from './VideoSession';
import { t } from '@/i18n';

// The manager lives outside React, for as long as the connection does: the provider creates and
// disposes of it, and whoever needs it reads it from here and is told when it changes.
let current: SyncPlayManager | null = null;
const managerListeners = new Set<() => void>();

function setCurrent(manager: SyncPlayManager | null) {
  current = manager;
  managerListeners.forEach((l) => l());
}

function subscribeToManager(cb: () => void) {
  managerListeners.add(cb);
  return () => managerListeners.delete(cb);
}

const NOT_IN_GROUP: SyncPlaySnapshot = { group: null, hasQueue: false, following: false, playlistItemId: null };
const noopSubscribe = () => () => {};

/** Creates the SyncPlay manager while signed in, and connects it to navigation and toasts. */
export function SyncPlayProvider({ children }: { children: ReactNode }) {
  const { api } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const toast = useToast();

  const ctx = useRef({ navigate, toast });
  useLayoutEffect(() => {
    ctx.current = { navigate, toast };
  });

  useEffect(() => {
    if (!api || !socket) return;
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
      const notify = ctx.current.toast;
      if (n.type === 'joined') notify.info(t('player.syncPlay.joined', { user: n.user }));
      else if (n.type === 'left') notify.info(t('player.syncPlay.left', { user: n.user }));
      else if (n.type === 'error') notify.error(n.message);
      else if (n.type === 'info') notify.info(n.message);
    };
    setCurrent(m);
    return () => {
      m.dispose();
      if (current === m) setCurrent(null);
    };
  }, [api, socket]);

  return children;
}

export function useSyncPlayManager(): SyncPlayManager | null {
  return useSyncExternalStore(
    subscribeToManager,
    () => current,
    () => null,
  );
}

export function useSyncPlay(): SyncPlaySnapshot {
  const manager = useSyncPlayManager();
  return useSyncExternalStore(manager?.subscribe ?? noopSubscribe, manager?.getSnapshot ?? (() => NOT_IN_GROUP), () => NOT_IN_GROUP);
}

/** The groups the user may see, shared by the menu and the invitation popup. */
export function useSyncPlayGroups(enabled: boolean, refetchInterval: number) {
  const manager = useSyncPlayManager();
  const session = useSession();
  return useQuery({
    queryKey: ['syncplay-groups'],
    queryFn: () => manager!.listGroups(),
    enabled: enabled && Boolean(manager),
    refetchInterval,
    staleTime: 0,
    select: (groups) => groups.filter((g) => canSeeGroup(g.Invite ?? null, session.userId)),
  });
}

/** Everyone on the server who can sign in, to invite to a group. */
export function useServerUsers(enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: ['users', 'enabled'],
    queryFn: () => api.get<UserDto[]>('/Users', { isDisabled: false }),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** Picks between a group for everyone and one for chosen users, then creates it. */
function CreateGroupForm({
  busy,
  onCreate,
  onCancel,
}: {
  busy: boolean;
  onCreate: (userIds: string[] | null) => void;
  onCancel: () => void;
}) {
  const session = useSession();
  const [inviteOnly, setInviteOnly] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const users = useServerUsers(inviteOnly);
  const others = (users.data ?? []).filter((u) => u.Id !== session.userId);
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const option = 'flex w-full items-center gap-3 px-4 py-1.5 text-left text-sm hover:bg-white/10';

  return (
    <div className="pb-1" data-testid="syncplay-create">
      <div className="px-4 pt-1 pb-1 text-xs font-medium text-muted" id="syncplay-who">
        {t('player.syncPlayProvider.whoCanJoin')}
      </div>
      <div role="radiogroup" aria-labelledby="syncplay-who">
        {[false, true].map((value) => (
          <button
            key={String(value)}
            role="radio"
            aria-checked={inviteOnly === value}
            className={option}
            onClick={() => setInviteOnly(value)}
          >
            <span
              className={clsx(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded-full ring-2',
                inviteOnly === value ? 'ring-accent' : 'ring-white/30',
              )}
            >
              {inviteOnly === value && <span className="h-2 w-2 rounded-full bg-accent" />}
            </span>
            {value ? t('player.syncPlayProvider.onlyPeopleIInvite') : t('player.syncPlayProvider.everyoneOnTheServer')}
          </button>
        ))}
      </div>
      {inviteOnly && (
        <div className="mx-4 mt-1 max-h-52 overflow-y-auto rounded-md bg-base-950/40 py-1 ring-1 ring-white/5">
          {users.isLoading ? (
            <div className="flex justify-center py-3 text-accent">
              <Spinner size={18} />
            </div>
          ) : users.isError ? (
            <p className="px-3 py-2 text-xs text-danger">{t('player.syncPlayProvider.usersFailed')}</p>
          ) : others.length === 0 ? (
            <p className="px-3 py-2 text-xs text-faint">{t('player.syncPlayProvider.noOtherUsers')}</p>
          ) : (
            others.map((u) => (
              <button
                key={u.Id}
                role="checkbox"
                aria-checked={picked.has(u.Id)}
                onClick={() => toggle(u.Id)}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm hover:bg-white/10"
              >
                <Avatar userId={u.Id} tag={u.PrimaryImageTag} name={u.Name} size={22} />
                <span className="min-w-0 flex-1 truncate">{u.Name}</span>
                <Check size={15} className={clsx('shrink-0', picked.has(u.Id) ? 'text-accent' : 'invisible')} />
              </button>
            ))
          )}
        </div>
      )}
      {inviteOnly && <p className="px-4 pt-1.5 text-[11px] leading-snug text-faint">{t('player.syncPlayProvider.inviteOnlyNote')}</p>}
      <div className="flex justify-end gap-2 px-4 pt-2">
        <button className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-white/10 hover:text-fg" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:brightness-110 disabled:opacity-50"
          disabled={busy || (inviteOnly && picked.size === 0)}
          onClick={() => onCreate(inviteOnly ? [...picked] : null)}
        >
          {t('player.syncPlayProvider.create')}
        </button>
      </div>
    </div>
  );
}

const STATE_LABEL: Record<string, string> = {
  Idle: t('player.syncPlayProvider.nothingPlaying'),
  Waiting: t('player.syncPlayProvider.waitingForEveryone'),
  Paused: t('player.syncPlayProvider.paused'),
  Playing: t('player.syncPlayProvider.playing'),
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
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const access = user?.Policy?.SyncPlayAccess ?? 'CreateAndJoinGroups';

  const groups = useSyncPlayGroups(open && !sync.group, 3000);
  const picker = usePicker(false);
  const pickerAction = usePickerAction();
  const [deleting, setDeleting] = useState(false);
  // The creator, while in the group (otherwise whoever is longest in it), may delete it for everyone.
  const canDelete = Boolean(picker.available && picker.data && picker.data.host === picker.data.me);
  // Closing the menu drops a half-filled form.
  if (!open && creating) setCreating(false);

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
        aria-label={t('player.syncPlayProvider.title')}
        title={
          sync.group
            ? t('player.syncPlayProvider.titleWithGroup', { groupName: sync.group.GroupName })
            : t('player.syncPlayProvider.syncplayWatchTogether')
        }
        className={clsx('rounded-full p-2 hover:bg-white/10', open || sync.group ? 'text-accent' : 'text-muted hover:text-fg')}
      >
        <Users size={20} />
      </button>
      {open && (
        <div
          className="animate-pop-in absolute top-12 right-0 z-50 w-80 max-w-[calc(100vw-1rem)] rounded-lg bg-base-750 py-2 shadow-2xl ring-1 ring-black/40"
          data-testid="syncplay-menu"
        >
          <div className="px-4 pt-1 pb-2 text-[11px] font-semibold tracking-wider text-faint uppercase">
            {t('player.syncPlayProvider.title')}
          </div>
          {sync.group ? (
            <>
              <div className="px-4 pb-2">
                <div className="truncate font-semibold" data-testid="syncplay-group-name">
                  {sync.group.GroupName}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted" data-testid="syncplay-state">
                  {STATE_LABEL[sync.group.State] ?? sync.group.State}
                  {sync.group.Invite && (
                    <>
                      <span className="text-faint">·</span>
                      <Lock size={11} /> {t('player.syncPlayProvider.inviteOnly')}
                    </>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5" data-testid="syncplay-participants">
                  {sync.group.Participants.map((p, i) => (
                    <span key={`${p}-${i}`} className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs">
                      {p}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-faint">
                  {sync.hasQueue ? t('player.syncPlayProvider.playPauseAndSeekApply') : t('player.syncPlayProvider.emptyHint')}
                </p>
              </div>
              {picker.available && (
                <button
                  className={row}
                  onClick={() => {
                    setPickerOpen(true);
                    setOpen(false);
                  }}
                >
                  <Dices size={16} className="shrink-0 text-accent" />
                  <span className="min-w-0 flex-1">{t('player.picker.open')}</span>
                  {picker.data && picker.data.suggestions.length > 0 && (
                    <span className="shrink-0 text-xs text-muted tabular-nums">
                      {t('player.picker.readyCount', {
                        ready: picker.data.participants.filter((p) => p.ready).length,
                        total: picker.data.participants.length,
                      })}
                    </span>
                  )}
                </button>
              )}
              {sync.hasQueue && !sync.following && (
                <button
                  className={row}
                  onClick={() => {
                    manager.rejoinPlayback();
                    setOpen(false);
                  }}
                >
                  <Play size={16} className="shrink-0 text-accent" /> {t('player.syncPlayProvider.joinPlayback')}
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
                <LogOut size={16} className="shrink-0 text-muted" /> {t('player.syncPlayProvider.leaveGroup')}
              </button>
              {canDelete && (
                <button
                  className={row}
                  disabled={busy}
                  onClick={() => {
                    setOpen(false);
                    setDeleting(true);
                  }}
                >
                  <Trash2 size={16} className="shrink-0 text-red-400" /> {t('player.syncPlayProvider.deleteGroup')}
                </button>
              )}
            </>
          ) : (
            <>
              {access === 'CreateAndJoinGroups' &&
                (creating ? (
                  <CreateGroupForm
                    busy={busy}
                    onCancel={() => setCreating(false)}
                    onCreate={(userIds) =>
                      void run(async () => {
                        const name = `${user?.Name ?? session.userName}'s group`;
                        await manager.createGroup(name, userIds ? { creatorId: session.userId, userIds } : undefined);
                        setCreating(false);
                      })
                    }
                  />
                ) : (
                  <button className={row} disabled={busy} onClick={() => setCreating(true)}>
                    <Plus size={16} className="shrink-0 text-accent" /> {t('player.syncPlayProvider.createGroup')}
                  </button>
                ))}
              {creating ? null : groups.isLoading ? (
                <div className="flex justify-center py-4 text-accent">
                  <Spinner size={20} />
                </div>
              ) : (groups.data ?? []).length === 0 ? (
                <p className="px-4 py-3 text-xs text-faint">{t('player.syncPlayProvider.noGroupsToJoinYet')}</p>
              ) : (
                groups.data!.map((g) => (
                  <button
                    key={g.GroupId}
                    className={row}
                    disabled={busy}
                    data-testid="syncplay-group"
                    onClick={() => void run(() => manager.joinGroup(g.GroupId))}
                  >
                    {g.Invite ? (
                      <Lock size={16} className="shrink-0 text-muted" aria-label={t('player.syncPlayProvider.inviteOnly')} />
                    ) : (
                      <Users size={16} className="shrink-0 text-muted" />
                    )}
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
      <ConfirmDialog
        open={deleting}
        title={t('player.syncPlayProvider.deleteGroupTitle')}
        message={t('player.syncPlayProvider.deleteGroupMessage')}
        confirmLabel={t('player.syncPlayProvider.deleteGroup')}
        danger
        loading={busy}
        onClose={() => setDeleting(false)}
        onConfirm={() =>
          void run(async () => {
            // Every Jellyfied member leaves when they read this; then this browser leaves too.
            await pickerAction.mutateAsync({ action: 'close' });
            await manager.leaveGroup();
            setDeleting(false);
            toast.success(t('player.syncPlayProvider.groupDeleted'));
          })
        }
      />
    </div>
  );
}
