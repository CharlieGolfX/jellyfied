import { Navigate, useParams } from 'react-router-dom';
import { useItem } from '@/api/queries';
import { PageSpinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { AlbumDetails, ArtistDetails, PlaylistDetails } from './MusicDetails';
import {
  CollectionDetails,
  FolderDetails,
  GenericDetails,
  PersonDetails,
  PhotoViewer,
  TagDetails,
} from './OtherDetails';
import { SeasonDetails, SeriesDetails } from './SeriesDetails';
import { VideoDetails } from './VideoDetails';

export default function ItemPage() {
  const { id } = useParams();
  const { data: item, isLoading, error, refetch } = useItem(id);

  if (isLoading) return <PageSpinner />;
  if (error || !item) return <ErrorState error={error ?? 'Item not found'} onRetry={() => refetch()} />;

  // Key by id so per-item state (selected tracks etc.) resets when navigating between items.
  const key = item.Id;
  switch (item.Type) {
    case 'Movie':
    case 'Episode':
    case 'Video':
    case 'MusicVideo':
    case 'Trailer':
    case 'Recording':
      return <VideoDetails key={key} item={item} />;
    case 'Series':
      return <SeriesDetails key={key} item={item} />;
    case 'Season':
      return <SeasonDetails key={key} item={item} />;
    case 'MusicAlbum':
      return <AlbumDetails key={key} item={item} />;
    case 'MusicArtist':
      return <ArtistDetails key={key} item={item} />;
    case 'Playlist':
      return <PlaylistDetails key={key} item={item} />;
    case 'Audio':
      if (item.AlbumId) return <Navigate to={`/item/${item.AlbumId}`} replace />;
      return <GenericDetails key={key} item={item} />;
    case 'Person':
      return <PersonDetails key={key} item={item} />;
    case 'BoxSet':
      return <CollectionDetails key={key} item={item} />;
    case 'Photo':
      return <PhotoViewer key={key} item={item} />;
    case 'Genre':
    case 'MusicGenre':
    case 'Studio':
    case 'Year':
      return <TagDetails key={key} item={item} />;
    case 'CollectionFolder':
    case 'UserView':
      return <Navigate to={`/library/${item.Id}`} replace />;
    case 'Folder':
    case 'PhotoAlbum':
    case 'AggregateFolder':
      return <FolderDetails key={key} item={item} />;
    default:
      if (item.MediaType === 'Video') return <VideoDetails key={key} item={item} />;
      if (item.IsFolder) return <FolderDetails key={key} item={item} />;
      return <GenericDetails key={key} item={item} />;
  }
}
