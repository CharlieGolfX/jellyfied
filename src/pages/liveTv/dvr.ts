import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MEDIA } from '@/api/queries';
import type { BaseItemDto, ItemsResult, SeriesTimerInfo, TimerInfo } from '@/api/types';
import { useApi, useCurrentUser, useSession } from '@/auth/AuthProvider';

/** Whether this user may schedule and cancel recordings. */
export function useCanRecord(): boolean {
  const policy = useCurrentUser().data?.Policy;
  return Boolean(policy?.IsAdministrator || policy?.EnableLiveTvManagement);
}

/** The recordings the server will make, soonest first. */
export function useTimers() {
  const api = useApi();
  return useQuery({
    queryKey: [MEDIA, 'livetv', 'timers'],
    queryFn: async () =>
      (await api.get<ItemsResult<TimerInfo>>('/LiveTv/Timers', { isScheduled: true })).Items.sort(
        (a, b) => Date.parse(a.StartDate) - Date.parse(b.StartDate),
      ),
  });
}

export function useSeriesTimers() {
  const api = useApi();
  return useQuery({
    queryKey: [MEDIA, 'livetv', 'series-timers'],
    queryFn: async () => (await api.get<ItemsResult<SeriesTimerInfo>>('/LiveTv/SeriesTimers', { sortBy: 'SortName' })).Items,
  });
}

/** A programme with everything the guide leaves out (overview, recording state). */
export function useProgram(id: string | undefined) {
  const api = useApi();
  const { userId } = useSession();
  return useQuery({
    queryKey: [MEDIA, 'livetv', 'program', id],
    enabled: Boolean(id),
    queryFn: () => api.get<BaseItemDto>(`/LiveTv/Programs/${id}`, { userId }),
  });
}

export type DvrAction =
  { kind: 'record'; programId: string } | { kind: 'cancel'; timerId: string } | { kind: 'cancelSeries'; seriesTimerId: string };

/**
 * Schedules or cancels a recording. A new one starts from the server's defaults for that
 * programme (padding), as Jellyfin's own interface does.
 */
export function useDvr() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: DvrAction) => {
      switch (action.kind) {
        case 'record': {
          const defaults = await api.get<Record<string, unknown>>('/LiveTv/Timers/Defaults', { programId: action.programId });
          await api.post('/LiveTv/Timers', defaults);
          break;
        }
        case 'cancel':
          await api.delete(`/LiveTv/Timers/${action.timerId}`);
          break;
        case 'cancelSeries':
          await api.delete(`/LiveTv/SeriesTimers/${action.seriesTimerId}`);
          break;
      }
    },
    // The guide, the programme and the lists of what will be recorded all change.
    onSettled: () => qc.invalidateQueries({ queryKey: [MEDIA, 'livetv'] }),
  });
}

/** What can be chosen for a series recording. */
export interface SeriesOptions {
  RecordNewOnly: boolean;
  RecordAnyChannel: boolean;
  RecordAnyTime: boolean;
  PrePaddingSeconds: number;
  PostPaddingSeconds: number;
  /** How many recordings to keep; 0 keeps them all. */
  KeepUpTo: number;
}

/**
 * The series recording a dialog edits: the server's defaults for a programme when it is new, or
 * the recording as it is. Kept whole, so saving sends back everything the server gave.
 */
export function useSeriesTimerDraft(target: { programId: string } | { seriesTimerId: string }) {
  const api = useApi();
  const key = 'programId' in target ? target.programId : target.seriesTimerId;
  return useQuery({
    queryKey: [MEDIA, 'livetv', 'series-draft', key],
    staleTime: 0,
    gcTime: 0,
    queryFn: () =>
      'programId' in target
        ? api.get<Record<string, unknown> & Partial<SeriesOptions>>('/LiveTv/Timers/Defaults', { programId: target.programId })
        : api.get<Record<string, unknown> & Partial<SeriesOptions>>(`/LiveTv/SeriesTimers/${target.seriesTimerId}`),
  });
}

/** Creates a series recording, or with `id`, changes one. */
export function useSaveSeriesTimer() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, timer }: { id?: string; timer: Record<string, unknown> }) =>
      api.post(id ? `/LiveTv/SeriesTimers/${id}` : '/LiveTv/SeriesTimers', timer),
    onSettled: () => qc.invalidateQueries({ queryKey: [MEDIA, 'livetv'] }),
  });
}
