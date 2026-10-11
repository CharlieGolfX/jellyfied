import { Search as SearchIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { CARD_QUERY } from '@/api/queries';
import type { ItemsResult } from '@/api/types';
import { useApi, useSession } from '@/auth/AuthProvider';
import { Hub, HubRow } from '@/components/media/Hub';
import { PersonCard } from '@/components/media/PersonCard';
import { SEARCH_TYPES } from '@/components/layout/SearchBox';
import { PageSpinner } from '@/components/ui/Spinner';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { usePageTitle } from '@/lib/usePageTitle';
import { t } from '@/i18n';

const GROUPS: { type: string; title: string }[] = [
  { type: 'Movie', title: t('common.movies') },
  { type: 'Series', title: t('common.tvShows') },
  { type: 'Episode', title: t('common.episodes') },
  { type: 'BoxSet', title: t('common.collections') },
  { type: 'MusicArtist', title: t('common.artists') },
  { type: 'MusicAlbum', title: t('common.albums') },
  { type: 'Audio', title: t('search.tracks') },
  { type: 'Playlist', title: t('common.playlists') },
  { type: 'MusicVideo', title: t('search.musicVideos') },
  { type: 'Video', title: t('search.videos') },
];

export default function SearchPage() {
  const api = useApi();
  const { userId } = useSession();
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  usePageTitle(q ? `“${q}”` : t('common.search'));

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['search', q],
    queryFn: async ({ signal }) => {
      const [items, people] = await Promise.all([
        api.get<ItemsResult>(
          '/Items',
          { ...CARD_QUERY, userId, searchTerm: q, recursive: true, includeItemTypes: SEARCH_TYPES, limit: 300 },
          signal,
        ),
        api.get<ItemsResult>('/Persons', { userId, searchTerm: q, limit: 40, enableImageTypes: 'Primary' }, signal),
      ]);
      return { items: items.Items, people: people.Items };
    },
    enabled: q.length > 0,
  });

  if (!q) {
    return (
      <EmptyState icon={<SearchIcon size={44} strokeWidth={1.25} />} title={t('search.searchYourLibraries')}>
        {t('search.findMoviesShowsEpisodesMusic')}
      </EmptyState>
    );
  }
  if (isLoading) return <PageSpinner />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  const total = (data?.items.length ?? 0) + (data?.people.length ?? 0);

  return (
    <div className="space-y-9 py-6 sm:py-8">
      <h1 className="px-4 text-2xl font-bold sm:px-8 lg:px-10">
        {t('search.resultsFor')} <span className="text-accent">“{q}”</span>
      </h1>
      {total === 0 && (
        <EmptyState icon={<SearchIcon size={44} strokeWidth={1.25} />} title={t('search.noResults2')}>
          {t('search.tryADifferentSpellingOr')}
        </EmptyState>
      )}
      {GROUPS.map((g) => (
        <Hub key={g.type} title={g.title} items={data?.items.filter((i) => i.Type === g.type)} />
      ))}
      {(data?.people.length ?? 0) > 0 && (
        <HubRow title={t('search.people')}>
          {data!.people.map((p) => (
            <PersonCard key={p.Id} person={{ Id: p.Id, Name: p.Name ?? '', PrimaryImageTag: p.ImageTags?.Primary, Type: undefined }} />
          ))}
        </HubRow>
      )}
    </div>
  );
}
