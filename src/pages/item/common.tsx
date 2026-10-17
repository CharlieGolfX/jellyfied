import clsx from 'clsx';
import {
  Check,
  Download,
  Film,
  FolderPlus,
  Heart,
  History,
  ListPlus,
  MoreHorizontal,
  Pencil,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  Shuffle,
  Star,
  Trash2,
} from 'lucide-react';
import { lazy, Suspense, useState, type MouseEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { backdropSrc, cardImage, imageSrc, type CardShape } from '@/api/images';
import { useClearProgress, useDeleteItem, useLocalTrailers, useRefreshItem, useSetFavorite, useSetPlayed } from '@/api/queries';
import type { BaseItemDto, BaseItemPerson } from '@/api/types';
import { useApi, useIsAdmin } from '@/auth/AuthProvider';
import { HubRow } from '@/components/media/Hub';
import { PersonCard } from '@/components/media/PersonCard';
import { AddToCollectionDialog, supportsCollections, useCanManageCollections } from '@/components/media/AddToCollection';
import { AddToPlaylistDialog, supportsPlaylists } from '@/components/media/Playlists';
import { fallbackIcon } from '@/components/media/PosterCard';
import { supportsMetadataEditing } from '@/components/media/metadataEditing';
import { Button } from '@/components/ui/Button';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Img } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { formatClock, formatRemaining, formatRuntime, playedPercent, ticksToSeconds, yearRange } from '@/lib/format';
import { useSuggestMenuItem } from '@/player/SyncPlayPicker';
import { isPlayable, supportsInstantMix, supportsWatchedState, useInstantMix, usePlay, type PlayOptions } from '@/player/usePlay';
import { t, tRich } from '@/i18n';

const MetadataEditor = lazy(() => import('@/components/media/MetadataEditor'));

/** Full-bleed blurred backdrop behind the detail page. */
export function Backdrop({ item }: { item: BaseItemDto }) {
  const api = useApi();
  const src = backdropSrc(api, item, 1920);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-[85vh] max-h-[900px] overflow-hidden">
      {src && <Img src={src} className="h-full w-full object-cover object-top opacity-40" />}
      <div className="absolute inset-0 bg-gradient-to-r from-base-900 via-base-900/80 to-base-900/30" />
      <div className="absolute inset-0 bg-gradient-to-t from-base-900 via-base-900/40 to-base-900/10" />
    </div>
  );
}

const posterAspect: Record<CardShape, string> = {
  poster: 'aspect-[2/3] w-40 sm:w-52 lg:w-64',
  square: 'aspect-square w-44 sm:w-56 lg:w-64',
  landscape: 'aspect-video w-64 sm:w-80 lg:w-96',
};

export function DetailPoster({ item, shape = 'poster', round }: { item: BaseItemDto; shape?: CardShape; round?: boolean }) {
  const api = useApi();
  const src = imageSrc(api, cardImage(item, shape), 640);
  const pct = item.UserData?.Played ? 0 : playedPercent(item);
  return (
    <div
      className={clsx(
        'relative shrink-0 overflow-hidden bg-base-800 shadow-2xl ring-1 ring-white/10',
        posterAspect[shape],
        round ? 'rounded-full' : 'rounded-lg',
      )}
    >
      <Img
        src={src}
        className="absolute inset-0 h-full w-full object-cover"
        fallback={<div className="absolute inset-0 flex items-center justify-center text-faint">{fallbackIcon(item, 64)}</div>}
      />
      {pct > 0 && (
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/60">
          <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export function RatingBadges({ item }: { item: BaseItemDto }) {
  return (
    <>
      {item.OfficialRating && (
        <span className="rounded border border-white/40 px-1.5 py-px text-xs font-semibold text-fg/90">{item.OfficialRating}</span>
      )}
      {item.CommunityRating ? (
        <span className="inline-flex items-center gap-1 text-fg/90" title={t('item.common.communityRating')}>
          <Star size={14} className="fill-star text-star" />
          {item.CommunityRating.toFixed(1)}
        </span>
      ) : null}
      {item.CriticRating ? (
        <span
          className={clsx('inline-flex items-center gap-1 font-medium', item.CriticRating >= 60 ? 'text-[#fa320a]' : 'text-success')}
          title={t('item.common.criticRating')}
        >
          <span className="inline-block h-3 w-3 rounded-full bg-current" />
          {item.CriticRating}%
        </span>
      ) : null}
    </>
  );
}

export function MetaLine({ item, extra }: { item: BaseItemDto; extra?: ReactNode }) {
  const parts: ReactNode[] = [];
  const year = yearRange(item);
  if (year) parts.push(year);
  if (item.RunTimeTicks && item.Type !== 'Series' && item.Type !== 'MusicArtist') parts.push(formatRuntime(item.RunTimeTicks));
  if (extra) parts.push(extra);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[15px] text-muted">
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-3">
          {i > 0 && <span className="text-faint">·</span>}
          {p}
        </span>
      ))}
      <RatingBadges item={item} />
    </div>
  );
}

export function ExpandableText({ text, lines = 4, className }: { text?: string | null; lines?: number; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const long = text.length > 320;
  return (
    <div className={className}>
      <p
        className="text-[15px] leading-relaxed whitespace-pre-line text-fg/90"
        style={
          expanded || !long
            ? undefined
            : { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
        }
      >
        {text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')}
      </p>
      {long && (
        <button onClick={() => setExpanded((e) => !e)} className="mt-1 text-sm font-semibold text-accent hover:underline">
          {expanded ? t('item.common.less') : t('common.more')}
        </button>
      )}
    </div>
  );
}

export function CreditsList({ item }: { item: BaseItemDto }) {
  const people = item.People ?? [];
  const directors = people.filter((p) => p.Type === 'Director');
  const writers = people.filter((p) => p.Type === 'Writer');
  const rows: [string, ReactNode][] = [];
  const links = (list: { Id: string; Name: string }[], prefix = '/item/') =>
    list.slice(0, 4).map((p, i) => (
      <span key={p.Id}>
        {i > 0 && ', '}
        <Link to={`${prefix}${p.Id}`} className="hover:text-accent hover:underline">
          {p.Name}
        </Link>
      </span>
    ));
  if (directors.length) rows.push([directors.length > 1 ? 'Directors' : 'Director', links(directors)]);
  if (writers.length) rows.push([writers.length > 1 ? 'Writers' : 'Writer', links(writers)]);
  if (item.Studios?.length) rows.push([item.Type === 'Series' ? 'Network' : 'Studio', links(item.Studios)]);
  if (item.GenreItems?.length) rows.push(['Genres', links(item.GenreItems)]);
  else if (item.Genres?.length) rows.push(['Genres', item.Genres.join(', ')]);
  if (!rows.length) return null;
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-5 gap-y-1.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="font-medium text-faint">{label}</dt>
          <dd className="text-fg/90">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CastHub({ people, title = 'Cast & Crew' }: { people?: BaseItemPerson[]; title?: string }) {
  if (!people?.length) return null;
  const ordered = [
    ...people.filter((p) => p.Type === 'Actor' || p.Type === 'GuestStar'),
    ...people.filter((p) => p.Type !== 'Actor' && p.Type !== 'GuestStar'),
  ];
  const seen = new Set<string>();
  const unique = ordered.filter((p) => (seen.has(p.Id + p.Type) ? false : (seen.add(p.Id + p.Type), true)));
  return (
    <HubRow title={title}>
      {unique.slice(0, 40).map((p) => (
        <PersonCard key={`${p.Id}-${p.Type}-${p.Role ?? ''}`} person={p} />
      ))}
    </HubRow>
  );
}

interface ActionBarProps {
  item: BaseItemDto;
  playOptions?: PlayOptions;
  showShuffle?: boolean;
  extraMenu?: MenuItem[];
}

export function ActionBar({ item, playOptions, showShuffle, extraMenu = [] }: ActionBarProps) {
  const api = useApi();
  const play = usePlay();
  const instantMix = useInstantMix();
  const navigate = useNavigate();
  const toast = useToast();
  const isAdmin = useIsAdmin();
  const setPlayed = useSetPlayed();
  const setFavorite = useSetFavorite();
  const refresh = useRefreshItem();
  const del = useDeleteItem();
  const clearProgress = useClearProgress();
  const canManageCollections = useCanManageCollections();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addingToCollection, setAddingToCollection] = useState(false);
  const [addingToPlaylist, setAddingToPlaylist] = useState(false);
  const [editing, setEditing] = useState(false);
  const trailers = useLocalTrailers(item.Id, (item.LocalTrailerCount ?? 0) > 0);
  const suggest = useSuggestMenuItem(item);

  const playable = isPlayable(item);
  const position = item.UserData?.PlaybackPositionTicks ?? 0;
  const resumable = position > 0 && !item.IsFolder;
  const played = Boolean(item.UserData?.Played);
  const favorite = Boolean(item.UserData?.IsFavorite);
  // Trailer links come from metadata, so only ever open plain web addresses.
  const remoteTrailer = item.RemoteTrailers?.find((trailer) => trailer.Url && /^https?:\/\//i.test(trailer.Url))?.Url;
  const localTrailer = trailers.data?.[0];

  const menu: MenuItem[] = [...extraMenu];
  if (suggest) menu.push(suggest);
  if (resumable && item.MediaType === 'Video') {
    menu.push({
      label: t('item.common.removeFromContinueWatching'),
      icon: <History size={16} />,
      onSelect: () =>
        clearProgress.mutate(item.Id, {
          onSuccess: () => toast.success(t('item.common.removedFromContinueWatching')),
          onError: (e) => toast.error(e),
        }),
    });
  }
  if (supportsPlaylists(item)) {
    menu.push({ label: t('common.addToPlaylist'), icon: <ListPlus size={16} />, onSelect: () => setAddingToPlaylist(true) });
  }
  if (canManageCollections && supportsCollections(item)) {
    menu.push({ label: t('common.addToCollection'), icon: <FolderPlus size={16} />, onSelect: () => setAddingToCollection(true) });
  }
  if (item.CanDownload && !item.IsFolder) {
    menu.push({
      label: t('item.common.download'),
      icon: <Download size={16} />,
      onSelect: () => window.open(api.url(`/Items/${item.Id}/Download`, {}, true), '_blank', 'noopener'),
    });
  }
  if (isAdmin) {
    if (supportsMetadataEditing(item)) {
      menu.push({ label: t('common.editMetadata'), icon: <Pencil size={16} />, onSelect: () => setEditing(true) });
    }
    menu.push(
      {
        label: t('item.common.refreshMetadata'),
        icon: <RefreshCw size={16} />,
        onSelect: () =>
          refresh.mutate(
            { id: item.Id },
            { onSuccess: () => toast.success(t('item.common.metadataRefreshQueued')), onError: (e) => toast.error(e) },
          ),
      },
      {
        label: t('item.common.replaceAllMetadata'),
        icon: <RefreshCw size={16} />,
        onSelect: () =>
          refresh.mutate(
            { id: item.Id, full: true },
            { onSuccess: () => toast.success(t('item.common.refreshQueued')), onError: (e) => toast.error(e) },
          ),
      },
    );
  }
  if (item.CanDelete) {
    menu.push(
      { divider: true, label: '' },
      { label: t('common.delete'), danger: true, icon: <Trash2 size={16} />, onSelect: () => setConfirmDelete(true) },
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {playable && (
        <Button
          variant="primary"
          size="lg"
          icon={<Play size={20} fill="currentColor" />}
          onClick={() => play(item, playOptions)}
          className="pr-6"
        >
          {resumable ? t('item.common.resumeFrom', { clock: formatClock(ticksToSeconds(position)) }) : t('common.play')}
        </Button>
      )}
      {playable && resumable && (
        <IconAction label={t('common.playFromBeginning')} onClick={() => play(item, { ...playOptions, fromStart: true })}>
          <RotateCcw size={20} />
        </IconAction>
      )}
      {showShuffle && playable && (
        <IconAction label={t('common.shuffle')} onClick={() => play(item, { shuffle: true })}>
          <Shuffle size={20} />
        </IconAction>
      )}
      {supportsInstantMix(item) && (
        <IconAction label={t('common.instantMix')} onClick={() => void instantMix(item)}>
          <Radio size={20} />
        </IconAction>
      )}
      {(localTrailer || remoteTrailer) && (
        <IconAction
          label={t('item.common.playTrailer')}
          onClick={() => {
            if (localTrailer) play(localTrailer);
            else if (remoteTrailer) window.open(remoteTrailer, '_blank', 'noopener');
          }}
        >
          <Film size={20} />
        </IconAction>
      )}
      {supportsWatchedState(item) && (
        <IconAction
          label={played ? t('common.markAsUnwatched') : t('common.markAsWatched')}
          active={played}
          onClick={() => setPlayed.mutate({ id: item.Id, played: !played }, { onError: (e) => toast.error(e) })}
        >
          <Check size={20} />
        </IconAction>
      )}
      <IconAction
        label={favorite ? t('item.common.removeFromFavorites') : t('item.common.addToFavorites')}
        active={favorite}
        onClick={() => setFavorite.mutate({ id: item.Id, favorite: !favorite }, { onError: (e) => toast.error(e) })}
      >
        <Heart size={20} className={favorite ? 'fill-current' : undefined} />
      </IconAction>
      {menu.length > 0 && (
        <Menu
          align="left"
          items={menu}
          trigger={({ toggle, open }) => (
            <IconAction label={t('common.more')} onClick={toggle} expanded={open}>
              <MoreHorizontal size={20} />
            </IconAction>
          )}
        />
      )}
      {resumable && item.RunTimeTicks ? <span className="ml-1 text-sm text-muted">{formatRemaining(item)}</span> : null}
      {addingToCollection && <AddToCollectionDialog item={item} onClose={() => setAddingToCollection(false)} />}
      {addingToPlaylist && <AddToPlaylistDialog item={item} onClose={() => setAddingToPlaylist(false)} />}
      {editing && (
        <Suspense fallback={null}>
          <MetadataEditor itemId={item.Id} onClose={() => setEditing(false)} />
        </Suspense>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={t('item.common.deleteItem')}
        danger
        confirmLabel={t('common.delete')}
        loading={del.isPending}
        message={<>{tRich('item.common.deleteConfirm', { name: <strong className="text-fg">{item.Name}</strong> })}</>}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() =>
          del.mutate(item.Id, {
            onSuccess: () => {
              setConfirmDelete(false);
              toast.success(t('item.common.itemDeleted'));
              navigate(-1);
            },
            onError: (e) => toast.error(e),
          })
        }
      />
    </div>
  );
}

function IconAction({
  label,
  onClick,
  active,
  expanded,
  children,
}: {
  label: string;
  onClick: (e: MouseEvent) => void;
  active?: boolean;
  expanded?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-expanded={expanded}
      className={clsx(
        'flex h-12 w-12 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20',
        active ? 'text-accent' : 'text-fg',
      )}
    >
      {children}
    </button>
  );
}

/** Standard page frame: backdrop + header (poster and info) + body content. */
export function DetailFrame({
  item,
  shape = 'poster',
  roundPoster,
  above,
  title,
  children,
  header,
}: {
  item: BaseItemDto;
  shape?: CardShape;
  roundPoster?: boolean;
  /** Small line above the title (e.g. series name). */
  above?: ReactNode;
  title?: ReactNode;
  /** Content in the header column below the title. */
  header: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="relative min-h-full pb-12">
      <Backdrop item={item} />
      <div className="relative px-4 pt-8 sm:px-8 sm:pt-12 lg:px-10">
        <div className="flex flex-col gap-8 md:flex-row md:items-start">
          <div className="flex justify-center md:block">
            <DetailPoster item={item} shape={shape} round={roundPoster} />
          </div>
          <div className="min-w-0 flex-1 space-y-4">
            {above && <div className="text-lg font-medium text-muted">{above}</div>}
            <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title ?? item.Name}</h1>
            {header}
          </div>
        </div>
      </div>
      {children && <div className="relative mt-10 space-y-10">{children}</div>}
    </div>
  );
}
