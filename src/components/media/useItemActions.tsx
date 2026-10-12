import {
  CheckCircle,
  Circle,
  FolderMinus,
  FolderPlus,
  Heart,
  History,
  ListPlus,
  Music,
  Pencil,
  Play,
  Radio,
  RotateCcw,
  Tv,
} from 'lucide-react';
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClearProgress, useSetFavorite, useSetPlayed } from '@/api/queries';
import type { BaseItemDto } from '@/api/types';
import { useIsAdmin } from '@/auth/AuthProvider';
import type { MenuItem } from '@/components/ui/Menu';
import { useToast } from '@/components/ui/Toast';
import { playedPercent } from '@/lib/format';
import { isPlayable, supportsInstantMix, supportsWatchedState, useInstantMix, usePlay } from '@/player/usePlay';
import { AddToCollectionDialog, supportsCollections, useCanManageCollections, useRemoveFromCollection } from './AddToCollection';
import { supportsMetadataEditing } from './metadataEditing';
import { AddToPlaylistDialog, supportsPlaylists } from './Playlists';
import { t } from '@/i18n';

const MetadataEditor = lazy(() => import('./MetadataEditor'));

/**
 * What can be done with an item from a card or a list row: its "more" menu, the dialogs that menu
 * opens, and the play and watched actions shown on the card itself.
 */
export function useItemActions(item: BaseItemDto, collectionId?: string) {
  const navigate = useNavigate();
  const play = usePlay();
  const instantMix = useInstantMix();
  const toast = useToast();
  const setPlayed = useSetPlayed();
  const setFavorite = useSetFavorite();
  const clearProgress = useClearProgress();
  const removeFromCollection = useRemoveFromCollection();
  const canManageCollections = useCanManageCollections();
  const [addingToCollection, setAddingToCollection] = useState(false);
  const [addingToPlaylist, setAddingToPlaylist] = useState(false);
  const isAdmin = useIsAdmin();
  const [editing, setEditing] = useState(false);

  const pct = item.UserData?.Played ? 0 : playedPercent(item);
  const played = Boolean(item.UserData?.Played);
  const unplayedCount = item.UserData?.UnplayedItemCount ?? 0;
  const watchable = supportsWatchedState(item);
  const playable = isPlayable(item);
  const showUnplayedTriangle = watchable && !item.IsFolder && !played && pct === 0 && item.MediaType === 'Video';

  const togglePlayed = () => setPlayed.mutate({ id: item.Id, played: !played }, { onError: (e) => toast.error(e) });

  const menuItems: MenuItem[] = [];
  if (playable) {
    menuItems.push({ label: t('common.play'), icon: <Play size={16} />, onSelect: () => play(item) });
    if (pct > 0)
      menuItems.push({
        label: t('common.playFromBeginning'),
        icon: <RotateCcw size={16} />,
        onSelect: () => play(item, { fromStart: true }),
      });
  }
  if (supportsInstantMix(item)) {
    menuItems.push({ label: t('common.instantMix'), icon: <Radio size={16} />, onSelect: () => void instantMix(item) });
  }
  if (watchable) {
    menuItems.push({
      label: played ? t('common.markAsUnwatched') : t('common.markAsWatched'),
      icon: played ? <Circle size={16} /> : <CheckCircle size={16} />,
      onSelect: togglePlayed,
    });
  }
  if (item.Type !== 'Person' && item.Type !== 'UserView' && item.Type !== 'CollectionFolder') {
    menuItems.push({
      label: item.UserData?.IsFavorite ? t('media.itemActions.removeFromFavorites') : t('media.itemActions.addToFavorites'),
      icon: <Heart size={16} />,
      onSelect: () => setFavorite.mutate({ id: item.Id, favorite: !item.UserData?.IsFavorite }, { onError: (e) => toast.error(e) }),
    });
  }
  // Based on the saved position, not the progress bar: a watched item that is being rewatched has both.
  if ((item.UserData?.PlaybackPositionTicks ?? 0) > 0 && item.MediaType === 'Video' && !item.IsFolder) {
    menuItems.push({
      label: t('media.itemActions.removeFromContinueWatching'),
      icon: <History size={16} />,
      // The card may be gone by the time the lists have refreshed, so don't rely on mutate() callbacks.
      onSelect: () =>
        void clearProgress.mutateAsync(item.Id).then(
          () => toast.success(t('media.itemActions.removedFromContinueWatching')),
          (e) => toast.error(e),
        ),
    });
  }
  if (supportsPlaylists(item)) {
    menuItems.push({ label: t('common.addToPlaylist'), icon: <ListPlus size={16} />, onSelect: () => setAddingToPlaylist(true) });
  }
  if (canManageCollections && supportsCollections(item)) {
    menuItems.push({ label: t('common.addToCollection'), icon: <FolderPlus size={16} />, onSelect: () => setAddingToCollection(true) });
    if (collectionId) {
      menuItems.push({
        label: t('media.itemActions.removeFromCollection'),
        icon: <FolderMinus size={16} />,
        onSelect: () =>
          void removeFromCollection.mutateAsync({ collectionId, itemId: item.Id }).then(
            () => toast.success(t('media.itemActions.removedFromCollection')),
            (e) => toast.error(e),
          ),
      });
    }
  }
  if (isAdmin && supportsMetadataEditing(item) && item.Type !== 'Person') {
    menuItems.push({ label: t('common.editMetadata'), icon: <Pencil size={16} />, onSelect: () => setEditing(true) });
  }
  if (item.Type === 'Episode' && item.SeriesId) {
    menuItems.push({ divider: true, label: '' });
    menuItems.push({
      label: t('media.itemActions.goToShow'),
      icon: <Tv size={16} />,
      onSelect: () => navigate(`/item/${item.SeriesId}`),
    });
    if (item.SeasonId)
      menuItems.push({
        label: t('media.itemActions.goToSeason'),
        icon: <Tv size={16} />,
        onSelect: () => navigate(`/item/${item.SeasonId}`),
      });
  }
  if (item.Type === 'Audio' && item.AlbumId) {
    menuItems.push({
      label: t('media.itemActions.goToAlbum'),
      icon: <Music size={16} />,
      onSelect: () => navigate(`/item/${item.AlbumId}`),
    });
  }

  const dialogs: ReactNode = (
    <>
      {addingToCollection && <AddToCollectionDialog item={item} onClose={() => setAddingToCollection(false)} />}
      {addingToPlaylist && <AddToPlaylistDialog item={item} onClose={() => setAddingToPlaylist(false)} />}
      {editing && (
        <Suspense fallback={null}>
          <MetadataEditor itemId={item.Id} onClose={() => setEditing(false)} />
        </Suspense>
      )}
    </>
  );

  return { menuItems, dialogs, play, togglePlayed, played, pct, unplayedCount, watchable, playable, showUnplayedTriangle };
}
