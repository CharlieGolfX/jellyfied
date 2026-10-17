import { useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, JellyfinApi } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { runtimeConfig } from '@/config';
import { t, type MessageKey } from '@/i18n';
import { appPath } from '@/lib/basePath';
import { useSyncPlay } from './SyncPlayProvider';

/**
 * The SyncPlay picker: members suggest films, shows and episodes, vote on each other's, and a wheel
 * picks one once everyone is ready. The state lives in Jellyfied's container (docker/syncplay-picker.js).
 */

/** How long the wheel turns. */
export const SPIN_MS = 7000;
/** How long the winner is shown before it starts. */
export const WINNER_MS = 2500;

export interface PickerSuggestion {
  id: string;
  by: string;
  votes: number;
  voters: string[];
  mine: boolean;
  voted: boolean;
}

export interface PickerSpin {
  round: number;
  at: number;
  by: string | null;
  winner: string;
  entries: { id: string; weight: number }[];
  offset: number;
  turns: number;
}

export interface PickerState {
  now: number;
  round: number;
  me: string;
  host: string | null;
  claimed: boolean;
  participants: { name: string; ready: boolean }[];
  suggestions: PickerSuggestion[];
  spin: PickerSpin | null;
  /** Who deleted the group, once it is deleted: its Jellyfied members then leave it. */
  closed: string | null;
  /** Server clock minus this browser's, in ms. Set when the answer arrives. */
  clockOffset: number;
}

export type PickerAction =
  | { action: 'claim' }
  | { action: 'suggest'; itemId: string }
  | { action: 'unsuggest'; itemId: string }
  | { action: 'vote'; itemId: string; on: boolean }
  | { action: 'ready'; on: boolean }
  | { action: 'spin' }
  | { action: 'close' }
  | { action: 'start'; round: number };

/**
 * The picker only works against the server the container proxies: it checks the caller's token with
 * that server, so a token for any other server must never be sent to it. A session saved under
 * another address of that same server (its direct address, say) is fine: the two report one server id.
 */
export function usePickerSupported(): boolean {
  const { api } = useAuth();
  const sameAddress = Boolean(api && runtimeConfig.serverUrl && api.serverUrl === runtimeConfig.serverUrl);
  const { data: sameServer } = useQuery({
    queryKey: ['syncplay-picker-server', api?.serverUrl],
    queryFn: async () => {
      const [proxied, own] = await Promise.all([
        new JellyfinApi(runtimeConfig.serverUrl).get<{ Id?: string }>('/System/Info/Public'),
        api!.get<{ Id?: string }>('/System/Info/Public'),
      ]);
      return Boolean(proxied?.Id && proxied.Id === own?.Id);
    },
    enabled: Boolean(api && runtimeConfig.serverUrl) && !sameAddress,
    staleTime: Infinity,
    retry: 1,
  });
  return sameAddress || sameServer === true;
}

export const normId = (id: string) => id.replace(/-/g, '').toLowerCase();

async function request(api: JellyfinApi, groupId: string, body?: PickerAction): Promise<PickerState & { go?: boolean }> {
  const res = await fetch(appPath(`/jellyfied-api/syncplay/${normId(groupId)}`), {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: api.authorizationHeader(), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: (PickerState & { code?: string; error?: string; go?: boolean }) | null = null;
  try {
    data = await res.json();
  } catch {
    /* not the picker answering, e.g. the dev server without it */
  }
  if (!res.ok || !data) {
    // A code this version has no text for reads as the general message.
    const key = `player.picker.errors.${data?.code ?? 'failed'}` as MessageKey;
    const message = t(key);
    throw new ApiError(res.ok ? 404 : res.status, message === key ? t('player.picker.errors.failed') : message);
  }
  return { ...data, clockOffset: data.now - Date.now() };
}

const pickerKey = (groupId: string | undefined) => ['syncplay-picker', groupId];

/** The picker of the group this browser is in. Polled, as nobody is told when someone else changes it. */
export function usePicker(fast: boolean) {
  const { api } = useAuth();
  const sync = useSyncPlay();
  const groupId = sync.group?.GroupId;
  const supported = usePickerSupported();
  const query = useQuery({
    queryKey: pickerKey(groupId),
    queryFn: () => request(api!, groupId!),
    enabled: supported && Boolean(groupId),
    refetchInterval: (q) => (q.state.error && (q.state.error as ApiError).status === 404 ? false : fast ? 1500 : 4000),
    retry: (count, err) => (err as ApiError).status !== 404 && count < 2,
  });
  // Not there at all: an older container, or the dev server without a Jellyfin to ask.
  const available = supported && Boolean(groupId) && !(query.error && [404, 405].includes((query.error as ApiError).status));
  return { ...query, groupId, available };
}

export function usePickerAction() {
  const { api } = useAuth();
  const sync = useSyncPlay();
  const qc = useQueryClient();
  const groupId = sync.group?.GroupId;
  return useMutation({
    mutationFn: (action: PickerAction) => request(api!, groupId!, action),
    onSuccess: (state) => qc.setQueryData(pickerKey(groupId), state),
  });
}

// ---- Whether the picker window is open ---------------------------------------

let pickerOpen = false;
const openListeners = new Set<() => void>();

export function setPickerOpen(open: boolean) {
  pickerOpen = open;
  openListeners.forEach((l) => l());
}

export function usePickerOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      openListeners.add(cb);
      return () => openListeners.delete(cb);
    },
    () => pickerOpen,
    () => false,
  );
}

// ---- The wheel -----------------------------------------------------------------

export interface WheelSlice {
  id: string;
  /** Degrees clockwise from the top. */
  start: number;
  end: number;
}

/** Each entry's share of the wheel follows its weight. */
export function wheelSlices(entries: { id: string; weight: number }[]): WheelSlice[] {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let at = 0;
  return entries.map((e) => {
    const start = at;
    at += total ? (e.weight / total) * 360 : 0;
    return { id: e.id, start, end: at };
  });
}

/**
 * How far the wheel turns so that the pointer at the top ends inside the winner's slice, at the
 * spot the server chose (`offset`, 0–1 across the slice). The same on every member's screen.
 */
export function finalRotation(slices: WheelSlice[], spin: Pick<PickerSpin, 'winner' | 'offset' | 'turns'>): number {
  const slice = slices.find((s) => s.id === spin.winner);
  if (!slice) return spin.turns * 360;
  return spin.turns * 360 - (slice.start + spin.offset * (slice.end - slice.start));
}

/** The SVG path of a slice of a circle. */
export function slicePath(cx: number, cy: number, r: number, start: number, end: number): string {
  if (end - start >= 359.999) return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
  const point = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return `${(cx + r * Math.sin(rad)).toFixed(2)} ${(cy - r * Math.cos(rad)).toFixed(2)}`;
  };
  return `M ${cx} ${cy} L ${point(start)} A ${r} ${r} 0 ${end - start > 180 ? 1 : 0} 1 ${point(end)} Z`;
}

const SEEN_KEY = 'jellyfied.pickerSpinsSeen';

/** Spins this tab has already shown, so a reload doesn't spin the wheel again. */
export function spinSeen(groupId: string, round: number): boolean {
  try {
    return (JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? '[]') as string[]).includes(`${groupId}:${round}`);
  } catch {
    return false;
  }
}

export function markSpinSeen(groupId: string, round: number) {
  try {
    const list = JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? '[]') as string[];
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...list, `${groupId}:${round}`].slice(-20)));
  } catch {
    /* ignore */
  }
}
