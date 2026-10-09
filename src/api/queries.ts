import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useApi, useSession } from '@/auth/AuthProvider';
import type { Query } from './client';
import type { BaseItemDto, ItemsResult, MediaSegment, QueryFilters } from './types';

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

export function useInfiniteItems(query: Query, enabled = true, path = '/Items') {
  const api = useApi();
  const { userId } = useSession();
  return useInfiniteQuery({
    queryKey: [MEDIA, 'infinite', path, query],
    queryFn: ({ pageParam, signal }) =>
      api.get<ItemsResult>(
        path,
        { ...CARD_QUERY, userId, ...query, startIndex: pageParam, limit: PAGE_SIZE, enableTotalRecordCount: true },
        signal,
      ),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.Items.length, 0);
      return loaded < last.TotalRecordCount && last.Items.length > 0 ? loaded : undefined;
    },
    enabled,
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

export function useSetPlayed() {
  const api = useApi();
  const { userId } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, played }: { id: string; played: boolean }) =>
      played
        ? api.post(`/UserPlayedItems/${id}`, undefined, { userId })
        : api.delete(`/UserPlayedItems/${id}`, { userId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [MEDIA] }),
  });
}

export function useSetFavorite() {
  const api = useApi();
  const { userId } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) =>
      favorite
        ? api.post(`/UserFavoriteItems/${id}`, undefined, { userId })
        : api.delete(`/UserFavoriteItems/${id}`, { userId }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: [MEDIA] }),
  });
}
