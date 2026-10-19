import { useQuery } from '@tanstack/react-query';
import { useItem } from '@/api/queries';
import type { BaseItemDto, ItemsResult } from '@/api/types';
import { useApi, useSession } from '@/auth/AuthProvider';

/** What plays after this item: the next entry of the queue it was started with, or the next episode. */
export function useUpNext(itemId: string, item: BaseItemDto | undefined, queue: string[] | undefined) {
  const api = useApi();
  const { userId } = useSession();
  const queueIndex = queue ? queue.indexOf(itemId) : -1;
  const nextFromQueue = queue && queueIndex >= 0 && queueIndex < queue.length - 1 ? queue[queueIndex + 1] : undefined;
  const nextEpisode = useQuery({
    queryKey: ['next-episode', itemId],
    queryFn: () =>
      api.get<ItemsResult>(`/Shows/${item!.SeriesId}/Episodes`, {
        userId,
        startItemId: itemId,
        limit: 2,
        isMissing: false,
        fields: ['PrimaryImageAspectRatio'],
      }),
    enabled: !nextFromQueue && item?.Type === 'Episode' && Boolean(item.SeriesId),
    staleTime: Infinity,
  });
  const nextId = nextFromQueue ?? nextEpisode.data?.Items.find((i) => i.Id !== itemId)?.Id;
  const { data: nextItem } = useItem(nextId);
  return { nextId, nextItem };
}
