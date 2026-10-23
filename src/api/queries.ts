import { useMemo, useRef } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { useApi, useSession } from '@/auth/AuthProvider';
import type { Query } from './client';
import type { BaseItemDto, ItemsResult, LegacyQueryFilters, MediaSegment, QueryFilters, UserItemData } from './types';

export const CARD_FIELDS = [
  'PrimaryImageAspectRatio',
  'DateCreated',
  'ChildCount',
  'RecursiveItemCount',
  'Overview',
  'Genres',
  'MediaSourceCount',
];

export const CARD_QUERY: Query = {
  fields: CARD_FIELDS,
  enableImageTypes: ['Primary', 'Backdrop', 'Thumb', 'Logo'],
  imageTypeLimit: 1,
  enableUserData: true,
};

/** Root key for everything that depends on user data, so watch-state changes refresh it all. */
export const MEDIA = 'media';

export function useUserViews() {
  const api = useApi();
  const { userId } = useSession();
  return useQuery({
    queryKey: [MEDIA, 'views', userId],
    queryFn: () => api.get<ItemsResult>('/UserViews', { userId }),
    staleTime: 5 * 60_000,
  });
}

export function useItem(id: string | undefined) {
  const api = useApi();
  const { userId } = useSession();
  return useQuery({
    queryKey: [MEDIA, 'item', id],
    queryFn: () => api.get<BaseItemDto>(`/Items/${id}`, { userId }),
    enabled: Boolean(id),
  });
}

/**
 * Loads an item's details when the pointer rests on its card, so its page opens without a wait.
 * Spread the result on the card's element.
 */
export function usePrefetchItem(id: string) {
  const api = useApi();
  const { userId } = useSession();
  const qc = useQueryClient();
  const timer = useRef(0);
  return useMemo(
    () => ({
      onPointerEnter: (e: { pointerType: string }) => {
        // A finger has no "resting on": the tap that follows opens the page anyway.
        if (e.pointerType !== 'mouse') return;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          void qc.prefetchQuery({
            queryKey: [MEDIA, 'item', id],
            queryFn: () => api.get<BaseItemDto>(`/Items/${id}`, { userId }),
            staleTime: 30_000,
          });
        }, 150);
      },
      onPointerLeave: () => window.clearTimeout(timer.current),
    }),
    [api, userId, qc, id],
  );
}

export function useItems(query: Query, opts: { enabled?: boolean; key?: QueryKey } = {}) {
  const api = useApi();
  const { userId } = useSession();
  return useQuery({
    queryKey: [MEDIA, 'items', ...(opts.key ?? []), query],
    queryFn: ({ signal }) => api.get<ItemsResult>('/Items', { ...CARD_QUERY, userId, ...query }, signal),
    enabled: opts.enabled ?? true,
  });
}

export const PAGE_SIZE = 100;

/**
 * A list loaded a page at a time. It normally starts at the top; with `start` it starts at that
 * position instead and can be extended in both directions. Pages loaded above the start hold a
 * multiple of `columns` items, so a grid with that many columns keeps its rows as they are.
 */
export function useInfiniteItems(query: Query, enabled = true, path = '/Items', start = 0, columns = 1) {
  const api = useApi();
  const { userId } = useSession();
  return useInfiniteQuery({
    queryKey: [MEDIA, 'infinite', path, query, start, start ? columns : 1],
    queryFn: ({ pageParam, signal }) =>
      api.get<ItemsResult>(
        path,
        { ...CARD_QUERY, userId, ...query, startIndex: pageParam.index, limit: pageParam.limit, enableTotalRecordCount: true },
        signal,
      ),
    initialPageParam: { index: start, limit: PAGE_SIZE },
    getNextPageParam: (last, _pages, param) => {
      const next = param.index + last.Items.length;
      return next < last.TotalRecordCount && last.Items.length > 0 ? { index: next, limit: PAGE_SIZE } : undefined;
    },
    getPreviousPageParam: (_first, _pages, param) => {
      if (param.index <= 0) return undefined;
      const index = Math.max(0, param.index - Math.max(columns, PAGE_SIZE - (PAGE_SIZE % columns)));
      return { index, limit: param.index - index };
    },
    enabled,
  });
}

/** Where the titles under a letter begin in a list sorted by title ('#' = before A). */
export function letterIndex(order: 'Ascending' | 'Descending', total: number, before: number, inLetter: number): number {
  return order === 'Ascending' ? before : Math.max(0, total - before - inLetter);
}

/** Position of the first title under `letter` in the list `query` describes, or undefined while it is being counted. */
export function useLetterIndex(query: Query, letter: string, order: 'Ascending' | 'Descending', path = '/Items') {
  const api = useApi();
  const { userId } = useSession();
  return useQuery({
    queryKey: [MEDIA, 'letter-index', path, query, letter, order],
    queryFn: async ({ signal }) => {
      const count = (extra: Query) =>
        api
          .get<ItemsResult>(path, { userId, ...query, ...extra, limit: 0, enableTotalRecordCount: true, enableImages: false }, signal)
          .then((r) => r.TotalRecordCount);
      const before = letter === '#' ? Promise.resolve(0) : count({ nameLessThan: letter });
      if (order === 'Ascending') return before;
      const inLetter = count(letter === '#' ? { nameLessThan: 'A' } : { nameStartsWith: letter });
      return letterIndex(order, await count({}), await before, await inLetter);
    },
    enabled: Boolean(letter),
    staleTime: 60_000,
  });
}

export function useResume(parentId?: string, mediaTypes: string[] = ['Video']) {
  const api = useApi();
  const { userId } = useSession();
  return useQuery({
    queryKey: [MEDIA, 'resume', parentId, mediaTypes],
    queryFn: () =>
      api.get<ItemsResult>('/UserItems/Resume', {
        ...CARD_QUERY,
        userId,
        parentId,
        mediaTypes,
        limit: 24,
      }),
  });
}

export function useNextUp(opts: { parentId?: string; seriesId?: string; limit?: number; enabled?: boolean } = {}) {
  const api = useApi();
  const { userId } = useSession();
  return useQuery({
    queryKey: [MEDIA, 'nextup', opts.parentId, opts.seriesId, opts.limit],
    queryFn: () =>
      api.get<ItemsResult>('/Shows/NextUp', {
        ...CARD_QUERY,
        userId,
        parentId: opts.parentId,
        seriesId: opts.seriesId,
        limit: opts.limit ?? 24,
        enableResumable: false,
        enableRewatching: false,
      }),
    enabled: opts.enabled ?? true,
  });
}

export function useLatest(parentId: string, opts: { includeItemTypes?: string[]; limit?: number } = {}) {
  const api = useApi();
  const { userId } = useSession();
  return useQuery({
    queryKey: [MEDIA, 'latest', parentId, opts],
    queryFn: () =>
      api.get<BaseItemDto[]>('/Items/Latest', {
        fields: CARD_FIELDS,
        enableImageTypes: ['Primary', 'Backdrop', 'Thumb'],
        imageTypeLimit: 1,
        userId,
        parentId,
        includeItemTypes: opts.includeItemTypes,
        limit: opts.limit ?? 24,
        groupItems: true,
      }),
  });
}

export function useSimilar(id: string, enabled = true) {
  const api = useApi();
  const { userId } = useSession();
  return useQuery({
    queryKey: [MEDIA, 'similar', id],
    queryFn: () => api.get<ItemsResult>(`/Items/${id}/Similar`, { userId, limit: 16, fields: CARD_FIELDS }),
    enabled,
  });
}

export function useSpecialFeatures(id: string, enabled = true) {
  const api = useApi();
  const { userId } = useSession();
  return useQuery({
    queryKey: [MEDIA, 'extras', id],
    queryFn: () => api.get<BaseItemDto[]>(`/Items/${id}/SpecialFeatures`, { userId }),
    enabled,
  });
}

export function useLocalTrailers(id: string, enabled = true) {
  const api = useApi();
  const { userId } = useSession();
  return useQuery({
    queryKey: [MEDIA, 'trailers', id],
    queryFn: () => api.get<BaseItemDto[]>(`/Items/${id}/LocalTrailers`, { userId }),
    enabled,
  });
}

export function useSeasons(seriesId: string | undefined) {
  const api = useApi();
  const { userId } = useSession();
  return useQuery({
    queryKey: [MEDIA, 'seasons', seriesId],
    queryFn: () =>
      api.get<ItemsResult>(`/Shows/${seriesId}/Seasons`, {
        userId,
        fields: CARD_FIELDS,
        enableImageTypes: ['Primary', 'Backdrop', 'Thumb'],
        enableUserData: true,
      }),
    enabled: Boolean(seriesId),
  });
}

export function useEpisodes(seriesId: string | undefined, seasonId?: string) {
  const api = useApi();
  const { userId } = useSession();
  return useQuery({
    queryKey: [MEDIA, 'episodes', seriesId, seasonId],
    queryFn: () =>
      api.get<ItemsResult>(`/Shows/${seriesId}/Episodes`, {
        userId,
        seasonId,
        fields: [...CARD_FIELDS, 'MediaSources'],
        enableImageTypes: ['Primary', 'Backdrop', 'Thumb'],
        enableUserData: true,
      }),
    enabled: Boolean(seriesId),
  });
}

export function useFilters(parentId: string | undefined, includeItemTypes?: string[]) {
  const api = useApi();
  const { userId } = useSession();
  return useQuery({
    queryKey: [MEDIA, 'filters', parentId, includeItemTypes],
    queryFn: () => api.get<QueryFilters>('/Items/Filters2', { userId, parentId, includeItemTypes }),
    enabled: Boolean(parentId),
    staleTime: 5 * 60_000,
  });
}

/** Years, age ratings and tags that occur in a library, for its filter menus. */
export function useFilterValues(parentId: string | undefined, includeItemTypes?: string[]) {
  const api = useApi();
  const { userId } = useSession();
  return useQuery({
    queryKey: [MEDIA, 'filter-values', parentId, includeItemTypes],
    queryFn: () => api.get<LegacyQueryFilters>('/Items/Filters', { userId, parentId, includeItemTypes }),
    enabled: Boolean(parentId),
    staleTime: 5 * 60_000,
  });
}

export function useStudios(parentId: string | undefined, includeItemTypes?: string[], enabled = true) {
  const api = useApi();
  const { userId } = useSession();
  return useQuery({
    queryKey: [MEDIA, 'studios', parentId, includeItemTypes],
    queryFn: () =>
      api.get<ItemsResult>('/Studios', {
        userId,
        parentId,
        includeItemTypes,
        sortBy: 'SortName',
        sortOrder: 'Ascending',
        enableImages: false,
      }),
    enabled: Boolean(parentId) && enabled,
    staleTime: 5 * 60_000,
  });
}

export function useMediaSegments(itemId: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: ['segments', itemId],
    queryFn: async () => {
      try {
        return await api.get<ItemsResult<MediaSegment>>(`/MediaSegments/${itemId}`);
      } catch {
        return { Items: [], TotalRecordCount: 0 } as ItemsResult<MediaSegment>;
      }
    },
    enabled: Boolean(itemId),
    staleTime: Infinity,
  });
}

/** `data` with the user data of item `id` changed wherever that item occurs in it; the same object if nowhere. */
export function patchUserData<T>(data: T, id: string, patch: Partial<UserItemData>): T {
  if (Array.isArray(data)) {
    let changed = false;
    const next = data.map((cached: unknown) => {
      const patched = patchUserData(cached, id, patch);
      if (patched !== cached) changed = true;
      return patched;
    });
    return changed ? (next as T) : data;
  }
  if (!data || typeof data !== 'object') return data;
  const node = data as Record<string, unknown>;
  if (node.Id === id && 'UserData' in node) return { ...node, UserData: { ...(node.UserData as object), ...patch } } as T;
  // Lists ({ Items }) and lists loaded a page at a time ({ pages }).
  for (const key of ['Items', 'pages'] as const) {
    if (Array.isArray(node[key])) {
      const next = patchUserData(node[key], id, patch);
      if (next !== node[key]) return { ...node, [key]: next } as T;
    }
  }
  return data;
}

/**
 * Shows a change to an item's user data everywhere right away, without waiting for the server.
 * Returns how to take it back, for when the server says no.
 */
function showAtOnce(qc: QueryClient, id: string, patch: Partial<UserItemData>): () => void {
  const before = qc.getQueriesData({ queryKey: [MEDIA] });
  // Answers on their way for lists with the item in them would put the old state back. Others,
  // such as the next page of a library being scrolled, carry on.
  for (const query of qc.getQueryCache().findAll({ queryKey: [MEDIA] })) {
    if (patchUserData(query.state.data, id, patch) !== query.state.data) void qc.cancelQueries({ queryKey: query.queryKey, exact: true });
  }
  patchCachedUserData(qc, id, patch);
  return () => before.forEach(([key, data]) => qc.setQueryData(key, data));
}

/** Changes an item's user data wherever it is cached. */
export function patchCachedUserData(qc: QueryClient, id: string, patch: Partial<UserItemData>) {
  qc.setQueriesData({ queryKey: [MEDIA] }, (data: unknown) => patchUserData(data, id, patch));
}

export function useSetPlayed() {
  const api = useApi();
  const { userId } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, played }: { id: string; played: boolean }) =>
      played ? api.post(`/UserPlayedItems/${id}`, undefined, { userId }) : api.delete(`/UserPlayedItems/${id}`, { userId }),
    onMutate: ({ id, played }) =>
      showAtOnce(qc, id, {
        Played: played,
        PlaybackPositionTicks: 0,
        PlayedPercentage: undefined,
        ...(played ? { UnplayedItemCount: 0 } : {}),
      }),
    onError: (_error, _vars, undo) => undo?.(),
    // The server knows the rest: counts on the show and season, Continue Watching.
    onSettled: () => qc.invalidateQueries({ queryKey: [MEDIA] }),
  });
}

export function useSetFavorite() {
  const api = useApi();
  const { userId } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) =>
      favorite ? api.post(`/UserFavoriteItems/${id}`, undefined, { userId }) : api.delete(`/UserFavoriteItems/${id}`, { userId }),
    onMutate: ({ id, favorite }) => showAtOnce(qc, id, { IsFavorite: favorite }),
    onError: (_error, _vars, undo) => undo?.(),
    onSettled: () => qc.invalidateQueries({ queryKey: [MEDIA] }),
  });
}

/** Clears the resume position, which takes the item out of Continue Watching. */
export function useClearProgress() {
  const api = useApi();
  const { userId } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/UserItems/${id}/UserData`, { PlaybackPositionTicks: 0 }, { userId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [MEDIA] }),
  });
}

export function useRefreshItem() {
  const api = useApi();
  return useMutation({
    mutationFn: ({ id, full }: { id: string; full?: boolean }) =>
      api.post(`/Items/${id}/Refresh`, undefined, {
        Recursive: true,
        MetadataRefreshMode: full ? 'FullRefresh' : 'Default',
        ImageRefreshMode: full ? 'FullRefresh' : 'Default',
        ReplaceAllMetadata: Boolean(full),
        ReplaceAllImages: Boolean(full),
      }),
  });
}

export function useDeleteItem() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/Items/${id}`),
    // Not awaited: the caller leaves the deleted item's page first. Waiting for the refresh would
    // reload that page's own item, fail with "Not Found" and replace the page before it can leave.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [MEDIA] });
    },
  });
}
