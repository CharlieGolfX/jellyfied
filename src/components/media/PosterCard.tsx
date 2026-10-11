import clsx from 'clsx';
import { Check, CheckCircle, Clapperboard, Film, Folder, Image as ImageIcon, ListMusic, MoreHorizontal, Music, Play, Tv, User } from 'lucide-react';
import { memo, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cardImage, defaultShape, imageSrc, type CardShape } from '@/api/images';
import type { BaseItemDto } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { Img } from '@/components/ui/States';
import { Menu } from '@/components/ui/Menu';
import { episodeLabel } from '@/lib/format';
import { useIsSelected, useSelection, useSelectionCount } from './selection';
import { useItemActions } from './useItemActions';

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

export function defaultTitles(item: BaseItemDto, context?: 'series'): { title: string; subtitle: string } {
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
  const s = shape ?? defaultShape(item);
  const src = imageSrc(api, cardImage(item, s), imageWidth[s]);
  const titles = defaultTitles(item, context);
  const { menuItems, dialogs, play, togglePlayed, played, pct, unplayedCount, watchable, playable, showUnplayedTriangle } = useItemActions(
    item,
    collectionId,
  );
  const selection = useSelection();
  const selected = useIsSelected(item.Id);
  const selecting = useSelectionCount() > 0;

  const finalTitle = title ?? titles.title;
  const finalSubtitle = subtitle ?? titles.subtitle;
  const round = item.Type === 'MusicArtist' || item.Type === 'Person';

  return (
    <div className={clsx('group/card relative min-w-0', className)} style={style}>
      <Link
        to={itemLink(item)}
        // While items are being selected, a click on a card selects it instead of opening it.
        onClick={
          selecting && selection
            ? (e) => {
                e.preventDefault();
                selection.toggle(item);
              }
            : undefined
        }
        className={clsx(
          'relative block overflow-hidden bg-base-800 shadow-md transition-[box-shadow] duration-150 group-hover/card:ring-2 group-hover/card:ring-accent',
          selected ? 'ring-2 ring-accent' : 'ring-white/0',
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
      {selection && !round && (
        <button
          onClick={() => selection.toggle(item)}
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select ${finalTitle}`}
          className={clsx(
            'absolute top-1.5 left-1.5 z-[1] flex h-6 w-6 items-center justify-center rounded-full border-2 shadow transition-opacity',
            selected ? 'border-accent bg-accent text-accent-ink' : 'border-white/80 bg-black/50 text-transparent hover:text-white/80',
            selected || selecting ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100',
          )}
        >
          <Check size={14} strokeWidth={3} />
        </button>
      )}
      {playable && !round && !selecting && (
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
      {!round && menuItems.length > 0 && !selecting && (
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
      {dialogs}
    </div>
  );
});
