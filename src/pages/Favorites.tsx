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
import { t } from '@/i18n';

const ROWS: { types: string; title: string }[] = [
  { types: 'Movie', title: t('common.movies') },
  { types: 'Series', title: t('common.tvShows') },
  { types: 'Episode', title: t('common.episodes') },
  { types: 'BoxSet', title: t('common.collections') },
  { types: 'MusicArtist', title: t('common.artists') },
  { types: 'MusicAlbum', title: t('common.albums') },
  { types: 'Audio', title: t('favorites.tracks') },
  { types: 'Playlist', title: t('common.playlists') },
  { types: 'Video,MusicVideo', title: t('favorites.videos') },
];

function FavoriteRow({ types, title }: { types: string; title: string }) {
  const { data } = useItems(
    { recursive: true, filters: 'IsFavorite', includeItemTypes: types, sortBy: 'SortName', sortOrder: 'Ascending', limit: 100 },
    { key: ['favorites', types] },
  );
  return <Hub title={title} items={data?.Items} />;
}

export default function FavoritesPage() {
  usePageTitle(t('favorites.favorites'));
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
      <EmptyState icon={<Heart size={44} strokeWidth={1.25} />} title={t('favorites.noFavoritesYet')}>
        {t('favorites.tapTheHeartOnAny')}
      </EmptyState>
    );
  }

  return (
    <div className="space-y-9 py-6 sm:py-8">
      <h1 className="px-4 text-2xl font-bold sm:px-8 lg:px-10">{t('favorites.favorites')}</h1>
      {ROWS.map((r) => (
        <FavoriteRow key={r.types} {...r} />
      ))}
      {(people.data?.Items.length ?? 0) > 0 && (
        <HubRow title={t('favorites.people')}>
          {people.data!.Items.map((p) => (
            <PersonCard key={p.Id} person={{ Id: p.Id, Name: p.Name ?? '', PrimaryImageTag: p.ImageTags?.Primary }} />
          ))}
        </HubRow>
      )}
    </div>
  );
}
