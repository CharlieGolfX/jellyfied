import { useMemo } from 'react';
import type { Query } from '@/api/client';
import { useItems, useLatest, useNextUp, useResume } from '@/api/queries';
import type { BaseItemDto } from '@/api/types';
import { Hub } from '@/components/media/Hub';
import { EmptyState } from '@/components/ui/States';
import { t } from '@/i18n';

export function Recommended({ library }: { library: BaseItemDto }) {
  const type = library.CollectionType;
  const latest = useLatest(library.Id, { limit: 24 });
  const resume = useResume(library.Id, type === 'music' ? ['Audio'] : ['Video']);
  const nextUp = useNextUp({ parentId: library.Id, enabled: type === 'tvshows' });
  const itemType = type === 'movies' ? 'Movie' : type === 'tvshows' ? 'Series' : 'MusicAlbum';

  const base: Query = { parentId: library.Id, recursive: true, includeItemTypes: itemType, limit: 24 };
  const released = useItems({ ...base, sortBy: 'PremiereDate,ProductionYear', sortOrder: 'Descending' }, { enabled: type !== 'music' });
  const topRated = useItems(
    {
      ...base,
      sortBy: 'CommunityRating',
      sortOrder: 'Descending',
      filters: type === 'music' ? undefined : 'IsUnplayed',
      minCommunityRating: 1,
    },
    { enabled: type !== 'music' },
  );
  const recentlyPlayed = useItems(
    {
      parentId: library.Id,
      recursive: true,
      includeItemTypes: type === 'music' ? 'MusicAlbum' : itemType,
      filters: 'IsPlayed',
      sortBy: 'DatePlayed',
      sortOrder: 'Descending',
      limit: 24,
    },
    { key: ['recentlyPlayed'] },
  );
  const newEpisodes = useItems(
    {
      parentId: library.Id,
      recursive: true,
      includeItemTypes: 'Episode',
      sortBy: 'PremiereDate',
      sortOrder: 'Descending',
      limit: 24,
      filters: 'IsUnplayed',
    },
    { enabled: type === 'tvshows' },
  );
  const random = useItems({ ...base, sortBy: 'Random' }, { key: ['random', library.Id] });
  const mostPlayed = useItems(
    {
      parentId: library.Id,
      recursive: true,
      includeItemTypes: 'Audio',
      sortBy: 'PlayCount',
      sortOrder: 'Descending',
      filters: 'IsPlayed',
      limit: 24,
    },
    { enabled: type === 'music' },
  );

  const continueItems = useMemo(() => {
    const items = [...(resume.data?.Items ?? [])];
    const seen = new Set(items.map((i) => i.SeriesId).filter(Boolean));
    for (const ep of nextUp.data?.Items ?? []) {
      if (ep.SeriesId && seen.has(ep.SeriesId)) continue;
      seen.add(ep.SeriesId);
      items.push(ep);
    }
    return items;
  }, [resume.data, nextUp.data]);

  const square = type === 'music';
  const noContent = !latest.isLoading && (latest.data?.length ?? 0) === 0 && !random.isLoading && (random.data?.Items.length ?? 0) === 0;

  if (noContent) {
    return <EmptyState title={t('library.recommended.thisLibraryIsEmpty')}>{t('library.recommended.addMediaToTheLibrary')}</EmptyState>;
  }

  return (
    <div className="space-y-9 pt-6">
      <Hub
        title={square ? t('library.recommended.continueListening') : t('library.recommended.continueWatching')}
        items={continueItems}
        shape={square ? 'square' : 'landscape'}
      />
      <Hub
        title={type === 'tvshows' ? t('library.recommended.recentlyAddedEpisodes') : t('library.recommended.recentlyAdded')}
        items={latest.data}
        loading={latest.isLoading}
        shape={square ? 'square' : 'poster'}
      />
      {type === 'tvshows' && <Hub title={t('library.recommended.newEpisodes')} items={newEpisodes.data?.Items} shape="landscape" />}
      {type !== 'music' && <Hub title={t('library.recommended.recentlyReleased')} items={released.data?.Items} shape="poster" />}
      {type === 'music' && <Hub title={t('library.recommended.recentlyPlayed')} items={recentlyPlayed.data?.Items} shape="square" />}
      {type === 'music' && <Hub title={t('library.recommended.mostPlayed')} items={mostPlayed.data?.Items} shape="square" />}
      {type !== 'music' && <Hub title={t('library.recommended.topRatedUnwatched')} items={topRated.data?.Items} shape="poster" />}
      {type !== 'music' && <Hub title={t('library.recommended.recentlyWatched')} items={recentlyPlayed.data?.Items} shape="poster" />}
      <Hub
        title={type === 'music' ? t('library.recommended.rediscover') : t('library.recommended.randomPicks')}
        items={random.data?.Items}
        shape={square ? 'square' : 'poster'}
      />
    </div>
  );
}
