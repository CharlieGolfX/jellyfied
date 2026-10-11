import { Heart } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { MEDIA, useItems } from '@/api/queries';
import type { ItemsResult } from '@/api/types';
import { useApi, useSession } from '@/auth/AuthProvider';
import { Hub, HubRow } from '@/components/media/Hub';
import { PersonCard } from '@/components/media/PersonCard';
import { PageSpinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/States';
import { usePageTitle } from '@/lib/usePageTitle';

const ROWS: { types: string; title: string }[] = [
  { types: 'Movie', title: 'Movies' },
  { types: 'Series', title: 'TV Shows' },
  { types: 'Episode', title: 'Episodes' },
  { types: 'BoxSet', title: 'Collections' },
  { types: 'MusicArtist', title: 'Artists' },
  { types: 'MusicAlbum', title: 'Albums' },
  { types: 'Audio', title: 'Tracks' },
  { types: 'Playlist', title: 'Playlists' },
  { types: 'Video,MusicVideo', title: 'Videos' },
];

function FavoriteRow({ types, title }: { types: string; title: string }) {
  const { data } = useItems(
    { recursive: true, filters: 'IsFavorite', includeItemTypes: types, sortBy: 'SortName', sortOrder: 'Ascending', limit: 100 },
    { key: ['favorites', types] },
  );
  return <Hub title={title} items={data?.Items} />;
}

export default function FavoritesPage() {
  usePageTitle('Favorites');
  const api = useApi();
  const { userId } = useSession();
  const any = useItems({ recursive: true, filters: 'IsFavorite', limit: 1, enableTotalRecordCount: true }, { key: ['favorites-any'] });
  const people = useQuery({
    queryKey: [MEDIA, 'favorite-people'],
    queryFn: () => api.get<ItemsResult>('/Persons', { userId, isFavorite: true, limit: 100 }),
  });

  if (any.isLoading) return <PageSpinner />;
  if ((any.data?.TotalRecordCount ?? 0) === 0 && (people.data?.Items.length ?? 0) === 0) {
    return (
      <EmptyState icon={<Heart size={44} strokeWidth={1.25} />} title="No favorites yet">
        Tap the heart on any movie, show, album or person to add it here.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-9 py-6 sm:py-8">
      <h1 className="px-4 text-2xl font-bold sm:px-8 lg:px-10">Favorites</h1>
      {ROWS.map((r) => (
        <FavoriteRow key={r.types} {...r} />
      ))}
      {(people.data?.Items.length ?? 0) > 0 && (
        <HubRow title="People">
          {people.data!.Items.map((p) => (
            <PersonCard key={p.Id} person={{ Id: p.Id, Name: p.Name ?? '', PrimaryImageTag: p.ImageTags?.Primary }} />
          ))}
        </HubRow>
      )}
    </div>
  );
}
