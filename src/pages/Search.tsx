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

const GROUPS: { type: string; title: string }[] = [
  { type: 'Movie', title: 'Movies' },
  { type: 'Series', title: 'TV Shows' },
  { type: 'Episode', title: 'Episodes' },
  { type: 'BoxSet', title: 'Collections' },
  { type: 'MusicArtist', title: 'Artists' },
  { type: 'MusicAlbum', title: 'Albums' },
  { type: 'Audio', title: 'Tracks' },
  { type: 'Playlist', title: 'Playlists' },
  { type: 'MusicVideo', title: 'Music Videos' },
  { type: 'Video', title: 'Videos' },
];

export default function SearchPage() {
  const api = useApi();
  const { userId } = useSession();
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  usePageTitle(q ? `“${q}”` : 'Search');

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
      <EmptyState icon={<SearchIcon size={44} strokeWidth={1.25} />} title="Search your libraries">
        Find movies, shows, episodes, music and people.
      </EmptyState>
    );
  }
  if (isLoading) return <PageSpinner />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  const total = (data?.items.length ?? 0) + (data?.people.length ?? 0);

  return (
    <div className="space-y-9 py-6 sm:py-8">
      <h1 className="px-4 text-2xl font-bold sm:px-8 lg:px-10">
        Results for <span className="text-accent">“{q}”</span>
      </h1>
      {total === 0 && (
        <EmptyState icon={<SearchIcon size={44} strokeWidth={1.25} />} title="No results">
          Try a different spelling or a shorter search.
        </EmptyState>
      )}
      {GROUPS.map((g) => (
        <Hub key={g.type} title={g.title} items={data?.items.filter((i) => i.Type === g.type)} />
      ))}
      {(data?.people.length ?? 0) > 0 && (
        <HubRow title="People">
          {data!.people.map((p) => (
            <PersonCard
              key={p.Id}
              person={{ Id: p.Id, Name: p.Name ?? '', PrimaryImageTag: p.ImageTags?.Primary, Type: undefined }}
            />
          ))}
        </HubRow>
      )}
    </div>
  );
}
