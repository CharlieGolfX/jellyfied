import clsx from 'clsx';
import {
  CheckCircle,
  Circle,
  Clapperboard,
  Film,
  Folder,
  FolderMinus,
  FolderPlus,
  History,
  Heart,
  Image as ImageIcon,
  ListMusic,
  ListPlus,
  MoreHorizontal,
  Pencil,
  Music,
  Play,
  Radio,
  RotateCcw,
  Tv,
  User,
} from 'lucide-react';
import { lazy, memo, Suspense, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cardImage, defaultShape, imageSrc, type CardShape } from '@/api/images';
import { useClearProgress, useSetFavorite, useSetPlayed } from '@/api/queries';
import type { BaseItemDto } from '@/api/types';
import { useApi, useIsAdmin } from '@/auth/AuthProvider';
import { Img } from '@/components/ui/States';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { supportsMetadataEditing } from './metadataEditing';
import { AddToCollectionDialog, supportsCollections, useCanManageCollections, useRemoveFromCollection } from './AddToCollection';
import { AddToPlaylistDialog, supportsPlaylists } from './Playlists';
import { useToast } from '@/components/ui/Toast';
import { episodeLabel, playedPercent } from '@/lib/format';
import { isPlayable, supportsInstantMix, supportsWatchedState, useInstantMix, usePlay } from '@/player/usePlay';

const MetadataEditor = lazy(() => import('./MetadataEditor'));

const aspect: Record<CardShape, string> = {
  poster: 'aspect-[2/3]',
  landscape: 'aspect-video',
  square: 'aspect-square',
};

const imageWidth: Record<CardShape, number> = { poster: 360, landscape: 560, square: 400 };

export function itemLink(item: BaseItemDto): string {
  return `/item/${item.Id}`;
}

export function fallbackIcon(item: BaseItemDto, size = 40): ReactNode {
  const p = { size, strokeWidth: 1.25 };
  switch (item.Type) {
    case 'Movie':
    case 'Trailer':
      return <Film {...p} />;
    case 'Series':
    case 'Season':
    case 'Episode':
      return <Tv {...p} />;
    case 'Audio':
    case 'MusicAlbum':
    case 'MusicArtist':
      return <Music {...p} />;
    case 'Playlist':
      return <ListMusic {...p} />;
    case 'Person':
      return <User {...p} />;
    case 'Photo':
    case 'PhotoAlbum':
      return <ImageIcon {...p} />;
    case 'BoxSet':
      return <Clapperboard {...p} />;
    case 'Folder':
    case 'CollectionFolder':
    case 'UserView':
      return <Folder {...p} />;
    default:
      return <Film {...p} />;
  }
}

function defaultTitles(item: BaseItemDto, context?: 'series'): { title: string; subtitle: string } {
  const name = item.Name ?? '';
  switch (item.Type) {
    case 'Episode':
      if (context === 'series') return { title: name, subtitle: episodeLabel(item) };
      return { title: item.SeriesName ?? name, subtitle: [episodeLabel(item), name].filter(Boolean).join(' — ') };
    case 'Season':
      return {
        title: name,
        subtitle: item.ChildCount ? `${item.ChildCount} episode${item.ChildCount === 1 ? '' : 's'}` : item.SeriesName ?? '',
      };
    case 'Series':
      return { title: name, subtitle: item.ProductionYear ? String(item.ProductionYear) : '' };
    case 'MusicAlbum':
      return { title: name, subtitle: item.AlbumArtist ?? item.ProductionYear?.toString() ?? '' };
    case 'Audio':
      return { title: name, subtitle: item.AlbumArtist ?? item.Artists?.[0] ?? '' };
    case 'MusicArtist':
      return { title: name, subtitle: '' };
    case 'BoxSet':
    case 'Playlist':
      return {
        title: name,
        subtitle: item.ChildCount ? `${item.ChildCount} item${item.ChildCount === 1 ? '' : 's'}` : '',
      };
    default:
      return { title: name, subtitle: item.ProductionYear ? String(item.ProductionYear) : '' };
  }
}

export interface PosterCardProps {
  item: BaseItemDto;
  shape?: CardShape;
  className?: string;
  style?: CSSProperties;
  title?: string;
  subtitle?: string;
  /** Context hint for labels: inside a series, episodes are titled by their own name. */
  context?: 'series';
  hideText?: boolean;
  /** Set on a collection's page: adds "Remove from collection" to the card menu. */
  collectionId?: string;
}

export const PosterCard = memo(function PosterCard({
  item,
  shape,
  className,
  style,
  title,
  subtitle,
  context,
  hideText,
  collectionId,
}: PosterCardProps) {
  const api = useApi();
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

  const s = shape ?? defaultShape(item);
  const src = imageSrc(api, cardImage(item, s), imageWidth[s]);
  const titles = defaultTitles(item, context);
  const pct = item.UserData?.Played ? 0 : playedPercent(item);
  const played = Boolean(item.UserData?.Played);
  const unplayedCount = item.UserData?.UnplayedItemCount ?? 0;
  const watchable = supportsWatchedState(item);
  const playable = isPlayable(item);
  const showUnplayedTriangle = watchable && !item.IsFolder && !played && pct === 0 && item.MediaType === 'Video';

  const togglePlayed = () =>
    setPlayed.mutate({ id: item.Id, played: !played }, { onError: (e) => toast.error(e) });

  const menuItems: MenuItem[] = [];
  if (playable) {
    menuItems.push({ label: 'Play', icon: <Play size={16} />, onSelect: () => play(item) });
    if (pct > 0)
      menuItems.push({
        label: 'Play from beginning',
        icon: <RotateCcw size={16} />,
        onSelect: () => play(item, { fromStart: true }),
      });
  }
  if (supportsInstantMix(item)) {
    menuItems.push({ label: 'Instant Mix', icon: <Radio size={16} />, onSelect: () => void instantMix(item) });
  }
  if (watchable) {
    menuItems.push({
      label: played ? 'Mark as unwatched' : 'Mark as watched',
      icon: played ? <Circle size={16} /> : <CheckCircle size={16} />,
      onSelect: togglePlayed,
    });
  }
  if (item.Type !== 'Person' && item.Type !== 'UserView' && item.Type !== 'CollectionFolder') {
    menuItems.push({
      label: item.UserData?.IsFavorite ? 'Remove from favorites' : 'Add to favorites',
      icon: <Heart size={16} />,
      onSelect: () =>
        setFavorite.mutate(
          { id: item.Id, favorite: !item.UserData?.IsFavorite },
          { onError: (e) => toast.error(e) },
        ),
    });
  }
  // Based on the saved position, not the progress bar: a watched item that is being rewatched has both.
  if ((item.UserData?.PlaybackPositionTicks ?? 0) > 0 && item.MediaType === 'Video' && !item.IsFolder) {
    menuItems.push({
      label: 'Remove from Continue Watching',
      icon: <History size={16} />,
      // The card may be gone by the time the lists have refreshed, so don't rely on mutate() callbacks.
      onSelect: () =>
        void clearProgress.mutateAsync(item.Id).then(
          () => toast.success('Removed from Continue Watching'),
          (e) => toast.error(e),
        ),
    });
  }
  if (supportsPlaylists(item)) {
    menuItems.push({ label: 'Add to playlist', icon: <ListPlus size={16} />, onSelect: () => setAddingToPlaylist(true) });
  }
  if (canManageCollections && supportsCollections(item)) {
    menuItems.push({ label: 'Add to collection', icon: <FolderPlus size={16} />, onSelect: () => setAddingToCollection(true) });
    if (collectionId) {
      menuItems.push({
        label: 'Remove from collection',
        icon: <FolderMinus size={16} />,
        onSelect: () =>
          void removeFromCollection.mutateAsync({ collectionId, itemId: item.Id }).then(
            () => toast.success('Removed from collection'),
            (e) => toast.error(e),
          ),
      });
    }
  }
  if (isAdmin && supportsMetadataEditing(item) && item.Type !== 'Person') {
    menuItems.push({ label: 'Edit metadata', icon: <Pencil size={16} />, onSelect: () => setEditing(true) });
  }
  if (item.Type === 'Episode' && item.SeriesId) {
    menuItems.push({ divider: true, label: '' });
    menuItems.push({ label: 'Go to show', icon: <Tv size={16} />, onSelect: () => navigate(`/item/${item.SeriesId}`) });
    if (item.SeasonId)
      menuItems.push({ label: 'Go to season', icon: <Tv size={16} />, onSelect: () => navigate(`/item/${item.SeasonId}`) });
  }
  if (item.Type === 'Audio' && item.AlbumId) {
    menuItems.push({ label: 'Go to album', icon: <Music size={16} />, onSelect: () => navigate(`/item/${item.AlbumId}`) });
  }

  const finalTitle = title ?? titles.title;
  const finalSubtitle = subtitle ?? titles.subtitle;
  const round = item.Type === 'MusicArtist' || item.Type === 'Person';

  return (
    <div className={clsx('group/card relative min-w-0', className)} style={style}>
      <Link
        to={itemLink(item)}
        className={clsx(
          'relative block overflow-hidden bg-base-800 shadow-md ring-white/0 transition-[box-shadow] duration-150 group-hover/card:ring-2 group-hover/card:ring-accent',
          round ? 'rounded-full' : 'rounded-md',
          aspect[s],
        )}
        aria-label={finalTitle}
      >
        <Img
          src={src}
          className="absolute inset-0 h-full w-full object-cover"
          fallback={
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-base-750 to-base-850 p-3 text-center text-faint">
              {fallbackIcon(item)}
              {s !== 'poster' || hideText ? null : (
                <span className="line-clamp-3 text-xs font-medium text-muted">{finalTitle}</span>
              )}
            </div>
          }
        />

        {showUnplayedTriangle && (
          <span
            className="absolute top-0 right-0 h-0 w-0 border-t-[22px] border-l-[22px] border-t-accent border-l-transparent drop-shadow"
            aria-label="Unwatched"
          />
        )}
        {item.IsFolder && unplayedCount > 0 && (item.Type === 'Series' || item.Type === 'Season' || item.Type === 'BoxSet') && (
          <span className="absolute top-1.5 right-1.5 min-w-6 rounded bg-accent px-1.5 py-0.5 text-center text-xs font-bold text-accent-ink shadow">
            {unplayedCount}
          </span>
        )}
        {played && watchable && (
          <span className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-0.5 text-accent">
            <CheckCircle size={16} />
          </span>
        )}

        {/* Hover overlay */}
        {!round && (
          <div className="absolute inset-0 bg-black/45 opacity-0 transition-opacity duration-150 group-hover/card:opacity-100" />
        )}

        {pct > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/60">
            <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
        )}
      </Link>

      {/* Hover actions live outside the link so they don't trigger navigation. */}
      {playable && !round && (
        <button
          onClick={() => play(item)}
          aria-label={`Play ${finalTitle}`}
          className={clsx(
            'absolute top-0 left-0 flex w-full items-center justify-center opacity-0 transition-opacity group-hover/card:opacity-100 pointer-events-none',
            aspect[s],
          )}
          tabIndex={-1}
        >
          <span className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-ink shadow-lg transition-transform hover:scale-110">
            <Play size={22} fill="currentColor" className="ml-0.5" />
          </span>
        </button>
      )}
      {!round && menuItems.length > 0 && (
        <div className={clsx('pointer-events-none absolute top-0 left-0 w-full', aspect[s])}>
          <div className="absolute right-1.5 bottom-2.5 left-1.5 flex items-center justify-between opacity-0 transition-opacity group-hover/card:opacity-100 [&:has([aria-expanded=true])]:opacity-100">
            {watchable ? (
              <button
                onClick={togglePlayed}
                className="pointer-events-auto rounded-full p-1.5 text-white/85 hover:bg-white/15 hover:text-white"
                aria-label={played ? 'Mark as unwatched' : 'Mark as watched'}
                title={played ? 'Mark as unwatched' : 'Mark as watched'}
              >
                {played ? <CheckCircle size={18} className="text-accent" /> : <CheckCircle size={18} />}
              </button>
            ) : (
              <span />
            )}
            <Menu
              items={menuItems}
              trigger={({ open, toggle }) => (
                <button
                  onClick={toggle}
                  aria-expanded={open}
                  aria-label="More actions"
                  className="pointer-events-auto rounded-full p-1.5 text-white/85 hover:bg-white/15 hover:text-white"
                >
                  <MoreHorizontal size={18} />
                </button>
              )}
            />
          </div>
        </div>
      )}

      {!hideText && (
        <div className={clsx('mt-2 min-w-0', round && 'text-center')}>
          <Link
            to={itemLink(item)}
            className="block truncate text-sm font-medium text-fg hover:underline"
            title={finalTitle}
          >
            {finalTitle}
          </Link>
          {finalSubtitle && (
            <div className="truncate text-xs text-muted" title={finalSubtitle}>
              {finalSubtitle}
            </div>
          )}
        </div>
      )}
      {addingToCollection && <AddToCollectionDialog item={item} onClose={() => setAddingToCollection(false)} />}
      {addingToPlaylist && <AddToPlaylistDialog item={item} onClose={() => setAddingToPlaylist(false)} />}
      {editing && (
        <Suspense fallback={null}>
          <MetadataEditor itemId={item.Id} onClose={() => setEditing(false)} />
        </Suspense>
      )}
    </div>
  );
});
