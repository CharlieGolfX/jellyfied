import clsx from 'clsx';
import { Check, Dices, Plus, Search, ThumbsUp, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cardImage, imageSrc } from '@/api/images';
import type { BaseItemDto, ItemsResult } from '@/api/types';
import { useApi, useSession } from '@/auth/AuthProvider';
import type { MenuItem } from '@/components/ui/Menu';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { Img } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { t } from '@/i18n';
import { episodeLabel } from '@/lib/format';
import { useLatest } from '@/lib/useLatest';
import {
  finalRotation,
  markSpinSeen,
  normId,
  usePickerSupported,
  setPickerOpen,
  slicePath,
  SPIN_MS,
  spinSeen,
  usePicker,
  usePickerAction,
  usePickerOpen,
  wheelSlices,
  WINNER_MS,
  type PickerSpin,
  type PickerState,
} from './syncplayPickerApi';
import { useSyncPlay, useSyncPlayManager } from './SyncPlayProvider';
import { useLocalPlay } from './usePlay';

const COLORS = ['#00a4dc', '#aa5cc3', '#e0a020', '#3dbb6b', '#e5484d', '#3b9eff', '#ef7b30', '#14a89a'];
const SIZE = 300;
const C = SIZE / 2;
const R = C - 6;
const ITEM_FIELDS = { fields: ['PrimaryImageAspectRatio'], enableImageTypes: ['Primary', 'Thumb'], imageTypeLimit: 1 };

function itemTitle(item: BaseItemDto | undefined): string {
  if (!item) return '…';
  if (item.Type === 'Episode') return `${item.SeriesName ?? ''} · ${episodeLabel(item)}`;
  return item.Name ?? '';
}

function itemDetail(item: BaseItemDto | undefined): string {
  if (!item) return '';
  if (item.Type === 'Episode') return item.Name ?? '';
  if (item.Type === 'Series') return [t('player.picker.show'), item.ProductionYear].filter(Boolean).join(' · ');
  return String(item.ProductionYear ?? '');
}

/** The items behind a list of ids, as this user sees them. */
function useItems(ids: string[]) {
  const api = useApi();
  const { userId } = useSession();
  const key = [...ids].sort().join(',');
  const query = useQuery({
    queryKey: ['picker-items', key],
    queryFn: () => api.get<ItemsResult>('/Items', { userId, ids: key.split(','), ...ITEM_FIELDS }),
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
  return useMemo(() => new Map((query.data?.Items ?? []).map((i) => [normId(i.Id), i])), [query.data]);
}

function Wheel({
  entries,
  names,
  spin,
  elapsed,
}: {
  entries: { id: string; weight: number }[];
  names: Map<string, BaseItemDto>;
  spin: PickerSpin | null;
  elapsed: number;
}) {
  const ref = useRef<SVGGElement>(null);
  const slices = useMemo(() => wheelSlices(entries), [entries]);
  const target = spin ? finalRotation(slices, spin) : 0;

  useLayoutEffect(() => {
    const g = ref.current;
    if (!g) return;
    if (!spin) {
      g.style.transform = '';
      return;
    }
    if (typeof g.animate !== 'function') {
      g.style.transform = `rotate(${target}deg)`;
      return;
    }
    const animation = g.animate([{ transform: 'rotate(0deg)' }, { transform: `rotate(${target}deg)` }], {
      duration: SPIN_MS,
      easing: 'cubic-bezier(0.12, 0.8, 0.2, 1)',
      fill: 'forwards',
    });
    // Everyone's wheel is at the same place: one that only now heard of the spin starts part-way.
    animation.currentTime = Math.min(SPIN_MS, Math.max(0, elapsed));
    return () => animation.cancel();
    // The spin itself is what restarts the animation, not every new answer from the server.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [spin?.round, target]);

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE + 14}`} className="mx-auto w-full max-w-[300px]" role="img" aria-label={t('player.picker.wheel')}>
      <g transform="translate(0 14)">
        <g ref={ref} style={{ transformOrigin: `${C}px ${C}px` }} data-testid="picker-wheel">
          {slices.length === 0 ? (
            <circle cx={C} cy={C} r={R} className="fill-base-700" />
          ) : (
            slices.map((s, i) => {
              const mid = (s.start + s.end) / 2;
              // Labels run from the rim inwards on the right half, and outwards on the left, so none is upside down.
              const left = mid > 180;
              const name = itemTitle(names.get(s.id));
              return (
                <g key={s.id}>
                  <path
                    d={slicePath(C, C, R, s.start, s.end)}
                    fill={COLORS[i % COLORS.length]}
                    stroke="rgb(0 0 0 / 0.35)"
                    strokeWidth={1.5}
                  />
                  {s.end - s.start >= 12 && (
                    <text
                      x={left ? C - R + 12 : C + R - 12}
                      y={C}
                      dy="0.35em"
                      textAnchor={left ? 'start' : 'end'}
                      transform={`rotate(${left ? mid - 270 : mid - 90} ${C} ${C})`}
                      className="fill-white text-[11px] font-semibold"
                      style={{ paintOrder: 'stroke', stroke: 'rgb(0 0 0 / 0.45)', strokeWidth: 3 }}
                    >
                      {name.length > 18 ? `${name.slice(0, 17)}…` : name}
                    </text>
                  )}
                </g>
              );
            })
          )}
        </g>
        <circle cx={C} cy={C} r={16} className="fill-base-850 stroke-white/20" strokeWidth={2} />
      </g>
      {/* The pointer, at the top. */}
      <path
        d={`M ${C - 11} 2 L ${C + 11} 2 L ${C} 26 Z`}
        className="fill-fg"
        style={{ filter: 'drop-shadow(0 1px 2px rgb(0 0 0 / 0.6))' }}
      />
    </svg>
  );
}

function AddSuggestion({ onAdd, busy }: { onAdd: (item: BaseItemDto) => void; busy: boolean }) {
  const api = useApi();
  const { userId } = useSession();
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(text.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [text]);
  const results = useQuery({
    queryKey: ['picker-search', debounced],
    queryFn: ({ signal }) =>
      api.get<ItemsResult>(
        '/Items',
        { userId, searchTerm: debounced, recursive: true, includeItemTypes: ['Movie', 'Series', 'Episode'], limit: 8, ...ITEM_FIELDS },
        signal,
      ),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });
  const list = debounced.length >= 2 ? (results.data?.Items ?? []) : [];

  return (
    <div className="relative">
      <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('player.picker.addPlaceholder')}
        aria-label={t('player.picker.add')}
        className="h-10 w-full rounded-md bg-base-950/60 pr-3 pl-9 text-sm text-fg ring-1 ring-white/10 placeholder:text-faint focus:ring-2 focus:ring-accent focus:outline-none"
      />
      {list.length > 0 && (
        <div className="absolute inset-x-0 top-11 z-10 max-h-72 overflow-y-auto rounded-md bg-base-750 py-1 shadow-2xl ring-1 ring-black/40">
          {list.map((item) => (
            <button
              key={item.Id}
              disabled={busy}
              onClick={() => {
                onAdd(item);
                setText('');
              }}
              className="flex w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-white/10 disabled:opacity-50"
            >
              <span className="h-12 w-8 shrink-0 overflow-hidden rounded bg-base-800">
                <Img src={imageSrc(api, cardImage(item, 'poster'), 64)} className="h-full w-full object-cover" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{itemTitle(item)}</span>
                <span className="block truncate text-xs text-muted">{itemDetail(item)}</span>
              </span>
              <Plus size={16} className="shrink-0 text-accent" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PickerBody({ state, showing, elapsed }: { state: PickerState; showing: PickerSpin | null; elapsed: number }) {
  const api = useApi();
  const toast = useToast();
  const act = usePickerAction();
  const ids = useMemo(
    () => [...new Set([...state.suggestions.map((s) => s.id), ...(showing?.entries.map((e) => e.id) ?? [])])],
    [state.suggestions, showing],
  );
  const items = useItems(ids);
  const entries = showing ? showing.entries : state.suggestions.map((s) => ({ id: s.id, weight: s.votes + 1 }));
  const meReady = state.participants.some((p) => p.name === state.me && p.ready);
  const readyCount = state.participants.filter((p) => p.ready).length;
  const done = showing && elapsed >= SPIN_MS;
  const winner = showing ? items.get(showing.winner) : undefined;
  const run = (action: Parameters<typeof act.mutate>[0]) => act.mutate(action, { onError: (e) => toast.error(e) });

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="flex flex-col items-center gap-4">
        <Wheel entries={entries} names={items} spin={showing} elapsed={elapsed} />
        <div className="min-h-12 text-center" aria-live="polite">
          {showing ? (
            done ? (
              <>
                <div className="text-xs font-semibold tracking-wider text-faint uppercase">{t('player.picker.winner')}</div>
                <div className="text-lg font-bold text-accent" data-testid="picker-winner">
                  {itemTitle(winner)}
                </div>
                <div className="text-xs text-muted">{t('player.picker.starting')}</div>
              </>
            ) : (
              <div className="text-sm text-muted">{t('player.picker.spinning')}</div>
            )
          ) : state.suggestions.length === 0 ? (
            <p className="text-sm text-muted">{t('player.picker.empty')}</p>
          ) : (
            <p className="text-xs text-faint">{t('player.picker.chances')}</p>
          )}
        </div>
        {!showing && (
          <div className="flex w-full flex-col items-center gap-3">
            <div className="flex flex-wrap justify-center gap-1.5" data-testid="picker-participants">
              {state.participants.map((p) => (
                <span
                  key={p.name}
                  className={clsx(
                    'flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs',
                    p.ready ? 'bg-success/20 text-success' : 'bg-white/10 text-muted',
                  )}
                >
                  {p.ready && <Check size={12} />}
                  {p.name}
                </span>
              ))}
            </div>
            <div className="text-xs text-faint">
              {t('player.picker.readyCount', { ready: readyCount, total: state.participants.length })}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant={meReady ? 'outline' : 'primary'}
                icon={<Check size={16} />}
                disabled={act.isPending || state.suggestions.length === 0}
                onClick={() => run({ action: 'ready', on: !meReady })}
              >
                {meReady ? t('player.picker.notReady') : t('player.picker.ready')}
              </Button>
              {state.host === state.me && (
                <Button
                  variant="outline"
                  icon={<Dices size={16} />}
                  disabled={act.isPending || state.suggestions.length === 0}
                  onClick={() => run({ action: 'spin' })}
                >
                  {t('player.picker.spinNow')}
                </Button>
              )}
            </div>
            {state.host && state.host !== state.me && (
              <p className="text-center text-[11px] text-faint">{t('player.picker.hostCanSpin', { name: state.host })}</p>
            )}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        {!showing && <AddSuggestion busy={act.isPending} onAdd={(item) => run({ action: 'suggest', itemId: normId(item.Id) })} />}
        {showing ? (
          <ul className="divide-y divide-white/5" data-testid="picker-spun">
            {showing.entries.map((e) => {
              const item = items.get(e.id);
              const won = done && e.id === showing.winner;
              return (
                <li key={e.id} className={clsx('flex items-center gap-3 py-2 transition-opacity', done && !won && 'opacity-40')}>
                  <span className="h-14 w-10 shrink-0 overflow-hidden rounded bg-base-750">
                    {item && <Img src={imageSrc(api, cardImage(item, 'poster'), 80)} className="h-full w-full object-cover" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={clsx('block truncate text-sm font-medium', won && 'text-accent')}>{itemTitle(item)}</span>
                    {itemDetail(item) && <span className="block truncate text-xs text-muted">{itemDetail(item)}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted tabular-nums">
                    <ThumbsUp size={13} /> {e.weight - 1}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="text-xs font-semibold tracking-wider text-faint uppercase">
            {t('player.picker.suggestions', { count: state.suggestions.length })}
          </div>
        )}
        {showing ? null : state.suggestions.length === 0 ? (
          <p className="text-sm text-muted">{t('player.picker.noSuggestions')}</p>
        ) : (
          <ul className="divide-y divide-white/5" data-testid="picker-suggestions">
            {state.suggestions.map((s) => {
              const item = items.get(s.id);
              return (
                <li key={s.id} className="flex items-center gap-3 py-2" data-testid="picker-suggestion">
                  <span className="h-14 w-10 shrink-0 overflow-hidden rounded bg-base-750">
                    {item && <Img src={imageSrc(api, cardImage(item, 'poster'), 80)} className="h-full w-full object-cover" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{itemTitle(item)}</span>
                    {itemDetail(item) && <span className="block truncate text-xs text-muted">{itemDetail(item)}</span>}
                    <span className="block truncate text-xs text-faint">
                      {s.mine ? t('player.picker.yourSuggestion') : t('player.picker.suggestedBy', { name: s.by })}
                    </span>
                  </span>
                  <button
                    disabled={s.mine || act.isPending || Boolean(showing)}
                    onClick={() => run({ action: 'vote', itemId: s.id, on: !s.voted })}
                    aria-pressed={s.voted}
                    aria-label={s.mine ? t('player.picker.cantVoteOwn') : s.voted ? t('player.picker.removeVote') : t('player.picker.vote')}
                    title={s.voters.length ? t('player.picker.votedBy', { names: s.voters.join(', ') }) : undefined}
                    className={clsx(
                      'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ring-1 transition-colors',
                      s.voted ? 'bg-accent-fill text-accent-ink ring-accent' : 'text-muted ring-white/15 hover:bg-white/10 hover:text-fg',
                      'disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent',
                    )}
                  >
                    <ThumbsUp size={13} /> {s.votes}
                  </button>
                  {s.mine && !showing && (
                    <button
                      onClick={() => run({ action: 'unsuggest', itemId: s.id })}
                      disabled={act.isPending}
                      aria-label={t('player.picker.remove')}
                      className="shrink-0 rounded-full p-1 text-faint hover:bg-white/10 hover:text-fg"
                    >
                      <X size={15} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * The picker window, and what happens when the wheel spins: every member's window opens to watch
 * it, and once it stops the first member to ask starts the winner for the whole group.
 */
export function SyncPlayPicker() {
  const api = useApi();
  const { userId } = useSession();
  const toast = useToast();
  const open = usePickerOpen();
  const picker = usePicker(open);
  const act = usePickerAction();
  const localPlay = useLocalPlay();
  const state = picker.available ? picker.data : undefined;
  const groupId = picker.groupId;
  const [showing, setShowing] = useState<PickerSpin | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Leaving the group closes the window.
  useEffect(() => {
    if (!groupId) {
      setPickerOpen(false);
      setShowing(null);
    }
  }, [groupId]);

  // Deleted by its creator: leave it. Jellyfin ends the group once its last member is gone.
  const manager = useSyncPlayManager();
  const closedBy = state?.closed ?? null;
  const left = useRef<string | null>(null);
  const me = state?.me;
  useEffect(() => {
    // Once per group: `left` keeps a later answer from the server from leaving it again.
    if (!closedBy || !groupId || !manager || left.current === groupId) return;
    left.current = groupId;
    setPickerOpen(false);
    if (closedBy !== me) toast.info(t('player.picker.deletedBy', { name: closedBy }));
    void manager.leaveGroup().catch((err) => toast.error(err));
  }, [closedBy, groupId, manager, me, toast]);

  // Whoever is alone in a new group made it, and keeps the right to spin by hand.
  const claim = state && !state.claimed && state.participants.length === 1;
  useEffect(() => {
    if (claim) act.mutate({ action: 'claim' });
    // Once each time this member finds themselves alone in a group. `act` is a new object on every
    // render, and claiming again with each one would send a request per render until the answer comes.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [claim, groupId]);

  // A new spin: open the window and watch it, unless this tab has already seen it or it is long over.
  const spin = state?.spin ?? null;
  const clockOffset = state?.clockOffset ?? 0;
  useEffect(() => {
    // Once per spin: the next answers from the server find it marked as seen.
    if (!spin || !groupId || spinSeen(groupId, spin.round)) return;
    markSpinSeen(groupId, spin.round);
    if (Date.now() + clockOffset - spin.at > SPIN_MS + WINNER_MS + 10_000) return;
    setShowing(spin);
    setPickerOpen(true);
  }, [spin, groupId, clockOffset]);

  const elapsed = showing ? now + clockOffset - showing.at : 0;

  // What the timer below calls, as it is when the wheel stops: the timer is set once per spin shown,
  // and must not start over with every render or answer from the server.
  const startWinner = useLatest(async (round: number, winner: string) => {
    try {
      const answer = await act.mutateAsync({ action: 'start', round });
      if (answer.go) {
        const item = await api.get<BaseItemDto>(`/Items/${winner}`, { userId });
        await localPlay(item);
      }
    } catch (err) {
      toast.error(err);
    } finally {
      setShowing(null);
      setPickerOpen(false);
    }
  });
  const offsetAtSpin = useLatest(clockOffset);

  useEffect(() => {
    if (!showing) return;
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    const startIn = Math.max(0, SPIN_MS + WINNER_MS - (Date.now() + offsetAtSpin.current - showing.at));
    const timer = window.setTimeout(() => void startWinner.current(showing.round, showing.winner), startIn);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(timer);
    };
  }, [showing, startWinner, offsetAtSpin]);

  // A window over a full-screen video would never be seen.
  useEffect(() => {
    if (open && document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
  }, [open]);

  if (!picker.available) return null;

  return (
    <Modal open={open} onClose={() => setPickerOpen(false)} title={t('player.picker.title')} size="xl">
      {state ? (
        <PickerBody state={state} showing={showing} elapsed={elapsed} />
      ) : picker.error ? (
        <p className="py-6 text-center text-sm text-muted">{(picker.error as Error).message}</p>
      ) : (
        <div className="flex justify-center py-10 text-accent">
          <Spinner size={24} />
        </div>
      )}
    </Modal>
  );
}

const SUGGESTABLE = ['Movie', 'Series', 'Episode'];

/** "Suggest for SyncPlay" for an item's menu, while in a group. */
export function useSuggestMenuItem(item: BaseItemDto): MenuItem | null {
  const sync = useSyncPlay();
  const toast = useToast();
  const act = usePickerAction();
  const supported = usePickerSupported();
  if (!sync.group || !supported || !SUGGESTABLE.includes(item.Type)) return null;
  return {
    label: t('player.picker.suggestThis'),
    icon: <Dices size={16} />,
    onSelect: () =>
      act.mutate(
        { action: 'suggest', itemId: normId(item.Id) },
        { onSuccess: () => toast.success(t('player.picker.suggested', { name: item.Name ?? '' })), onError: (e) => toast.error(e) },
      ),
  };
}
