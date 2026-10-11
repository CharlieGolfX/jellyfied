import clsx from 'clsx';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MEDIA, useInfiniteItems } from '@/api/queries';
import type { BaseItemDto, ItemsResult } from '@/api/types';
import { useApi, useSession } from '@/auth/AuthProvider';
import { CardGrid } from '@/components/media/CardGrid';
import { PageSpinner } from '@/components/ui/Spinner';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { plural } from '@/lib/format';
import { t } from '@/i18n';

export function ArtistsGrid({ library }: { library: BaseItemDto }) {
  const result = useInfiniteItems({ parentId: library.Id, sortBy: 'SortName', sortOrder: 'Ascending' }, true, '/Artists/AlbumArtists');
  const items = useMemo(() => result.data?.pages.flatMap((p) => p.Items) ?? [], [result.data]);
  const total = result.data?.pages[0]?.TotalRecordCount ?? 0;
  return (
    <div className="px-4 pt-5 sm:px-8 lg:px-10">
      <div className="mb-5 text-sm text-muted">{result.isLoading ? '…' : plural(total, 'artist')}</div>
      {result.error ? (
        <ErrorState error={result.error} onRetry={() => result.refetch()} />
      ) : !result.isLoading && items.length === 0 ? (
        <EmptyState title={t('library.genreGrid.noArtists')} />
      ) : (
        <CardGrid
          items={items}
          shape="square"
          minWidth={150}
          loading={result.isLoading}
          hasMore={result.hasNextPage}
          loadingMore={result.isFetchingNextPage}
          onLoadMore={() => !result.isFetchingNextPage && result.fetchNextPage()}
        />
      )}
    </div>
  );
}

const GENRE_COLORS = [
  'from-purple-600/80 to-sky-800/80',
  'from-sky-600/80 to-indigo-900/80',
  'from-emerald-600/80 to-teal-900/80',
  'from-rose-600/80 to-fuchsia-900/80',
  'from-violet-600/80 to-purple-900/80',
  'from-lime-600/80 to-green-900/80',
  'from-cyan-600/80 to-blue-900/80',
  'from-red-600/80 to-rose-900/80',
];

export function GenreGrid({ library }: { library: BaseItemDto }) {
  const api = useApi();
  const { userId } = useSession();
  const [, setParams] = useSearchParams();
  const isMusic = library.CollectionType === 'music';
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [MEDIA, 'genres', library.Id],
    queryFn: () =>
      api.get<ItemsResult>(isMusic ? '/MusicGenres' : '/Genres', {
        parentId: library.Id,
        userId,
        sortBy: 'SortName',
        sortOrder: 'Ascending',
      }),
  });

  if (isLoading) return <PageSpinner />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!data?.Items.length) return <EmptyState title={t('library.genreGrid.noCategories')} />;

  return (
    <div className="grid gap-4 px-4 pt-6 sm:px-8 lg:px-10" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
      {data.Items.map((g, i) => (
        <button
          key={g.Id}
          onClick={() => {
            const next = new URLSearchParams();
            next.set('tab', isMusic ? 'albums' : 'library');
            next.set('genre', g.Id);
            setParams(next);
          }}
          className={clsx(
            'group relative flex aspect-[16/7] items-end overflow-hidden rounded-lg bg-gradient-to-br p-4 text-left shadow-lg ring-white/0 transition hover:ring-2 hover:ring-accent',
            GENRE_COLORS[i % GENRE_COLORS.length],
          )}
        >
          <span className="text-lg font-bold drop-shadow">{g.Name}</span>
        </button>
      ))}
    </div>
  );
}
