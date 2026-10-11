import { ChevronLeft, ChevronRight, Pause, Play, Presentation, X } from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useInfiniteItems, useItems } from '@/api/queries';
import type { BaseItemDto } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { CardGrid } from '@/components/media/CardGrid';
import { Hub } from '@/components/media/Hub';
import { PageSpinner } from '@/components/ui/Spinner';
import { EmptyState, ErrorState, Img } from '@/components/ui/States';
import { formatDate, plural } from '@/lib/format';
import { FolderGrid } from '@/pages/library/FolderGrid';
import { ActionBar, DetailFrame, ExpandableText, MetaLine } from './common';

export function PersonDetails({ item }: { item: BaseItemDto }) {
  const base = { personIds: item.Id, recursive: true, sortBy: 'PremiereDate,ProductionYear,SortName', sortOrder: 'Descending', limit: 60 };
  const movies = useItems({ ...base, includeItemTypes: 'Movie' }, { key: ['person-movies', item.Id] });
  const shows = useItems({ ...base, includeItemTypes: 'Series' }, { key: ['person-shows', item.Id] });
  const other = useItems({ ...base, includeItemTypes: 'MusicVideo,Video,Episode' }, { key: ['person-other', item.Id] });

  const born = formatDate(item.PremiereDate, { dateStyle: 'long' });
  const died = formatDate(item.EndDate, { dateStyle: 'long' });
  const total = (movies.data?.TotalRecordCount ?? 0) + (shows.data?.TotalRecordCount ?? 0);
  const loading = movies.isLoading || shows.isLoading;

  return (
    <DetailFrame
      item={item}
      header={
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[15px] text-muted">
            {born && <span>Born {born}</span>}
            {died && <span>Died {died}</span>}
            {total > 0 && <span>{plural(total, 'title')} in your library</span>}
          </div>
          <div className="pt-2">
            <ActionBar item={item} />
          </div>
          <ExpandableText text={item.Overview} lines={6} className="max-w-4xl pt-1" />
        </>
      }
    >
      {loading && <PageSpinner />}
      <Hub title="Movies" items={movies.data?.Items} shape="poster" />
      <Hub title="TV Shows" items={shows.data?.Items} shape="poster" />
      <Hub title="Other Appearances" items={other.data?.Items} shape="landscape" />
    </DetailFrame>
  );
}

export function CollectionDetails({ item }: { item: BaseItemDto }) {
  const children = useItems(
    { parentId: item.Id, sortBy: 'PremiereDate,ProductionYear,SortName', sortOrder: 'Ascending', recursive: false },
    { key: ['boxset', item.Id] },
  );
  const count = children.data?.TotalRecordCount ?? 0;

  return (
    <DetailFrame
      item={item}
      header={
        <>
          <MetaLine item={{ ...item, ProductionYear: null }} extra={count ? <span>{plural(count, 'item')}</span> : undefined} />
          <div className="pt-2">
            <ActionBar item={item} showShuffle />
          </div>
          <ExpandableText text={item.Overview} className="max-w-4xl pt-1" />
        </>
      }
    >
      <section className="px-4 sm:px-8 lg:px-10">
        {children.isLoading ? (
          <PageSpinner />
        ) : children.error ? (
          <ErrorState error={children.error} onRetry={() => children.refetch()} />
        ) : count === 0 ? (
          <EmptyState title="This collection is empty" />
        ) : (
          <CardGrid items={children.data!.Items} shape="poster" cardProps={{ collectionId: item.Id }} />
        )}
      </section>
    </DetailFrame>
  );
}

/** Seconds each photo stays up in a slideshow. */
export const SLIDESHOW_SECONDS = 5;

export function FolderDetails({ item }: { item: BaseItemDto }) {
  const shape = item.Type === 'PhotoAlbum' ? 'square' : item.CollectionType === 'homevideos' ? 'landscape' : 'poster';
  // The first photo in the folder, to start a slideshow from.
  const firstPhoto = useItems(
    { parentId: item.Id, includeItemTypes: 'Photo', sortBy: 'SortName', sortOrder: 'Ascending', limit: 1, fields: [] },
    { key: ['first-photo', item.Id] },
  ).data?.Items[0];
  return (
    <div className="pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-8 sm:px-8 lg:px-10">
        <h1 className="text-2xl font-bold">{item.Name}</h1>
        {firstPhoto && (
          <Link
            to={`/item/${firstPhoto.Id}?slideshow=1`}
            className="flex h-9 items-center gap-2 rounded-md bg-white/10 px-3 text-sm font-semibold transition-colors hover:bg-white/20"
          >
            <Presentation size={16} /> Slideshow
          </Link>
        )}
      </div>
      <FolderGrid
        parentId={item.Id}
        shape={shape}
        shuffleItem={item.Type === 'PhotoAlbum' || item.CollectionType === 'photos' || item.CollectionType === 'books' ? undefined : item}
      />
    </div>
  );
}

/** Genre, studio and year pages. */
export function TagDetails({ item }: { item: BaseItemDto }) {
  const filterKey = item.Type === 'Studio' ? 'studioIds' : item.Type === 'Year' ? 'years' : 'genreIds';
  const filterValue = item.Type === 'Year' ? (item.Name ?? '') : item.Id;
  const isMusic = item.Type === 'MusicGenre';
  const result = useInfiniteItems({
    [filterKey]: filterValue,
    recursive: true,
    includeItemTypes: isMusic ? ['MusicAlbum'] : ['Movie', 'Series'],
    sortBy: 'SortName',
    sortOrder: 'Ascending',
  });
  const items = useMemo(() => result.data?.pages.flatMap((p) => p.Items) ?? [], [result.data]);
  const total = result.data?.pages[0]?.TotalRecordCount ?? 0;

  return (
    <div className="px-4 pt-8 pb-10 sm:px-8 lg:px-10">
      <div className="mb-6">
        <div className="text-sm font-medium tracking-wider text-faint uppercase">
          {item.Type === 'Studio' ? 'Studio' : item.Type === 'Year' ? 'Year' : 'Genre'}
        </div>
        <h1 className="text-3xl font-bold">{item.Name}</h1>
        <div className="mt-1 text-sm text-muted">{result.isLoading ? '…' : plural(total, 'title')}</div>
      </div>
      {result.error ? (
        <ErrorState error={result.error} onRetry={() => result.refetch()} />
      ) : (
        <CardGrid
          items={items}
          shape={isMusic ? 'square' : 'poster'}
          loading={result.isLoading}
          hasMore={result.hasNextPage}
          loadingMore={result.isFetchingNextPage}
          onLoadMore={() => !result.isFetchingNextPage && result.fetchNextPage()}
        />
      )}
    </div>
  );
}

export function PhotoViewer({ item }: { item: BaseItemDto }) {
  const api = useApi();
  const navigate = useNavigate();
  const siblings = useItems(
    {
      parentId: item.ParentId ?? undefined,
      includeItemTypes: 'Photo',
      sortBy: 'SortName',
      sortOrder: 'Ascending',
      limit: 2000,
      fields: [],
    },
    { enabled: Boolean(item.ParentId), key: ['photo-siblings', item.ParentId] },
  );
  const list = siblings.data?.Items ?? [];
  const index = list.findIndex((p) => p.Id === item.Id);
  const prev = index > 0 ? list[index - 1] : undefined;
  const next = index >= 0 && index < list.length - 1 ? list[index + 1] : undefined;

  // The viewer is opened again for every photo, so whether the slideshow runs lives in the address.
  const [params] = useSearchParams();
  const playing = params.has('slideshow');
  const address = useCallback((p: BaseItemDto, slideshow: boolean) => `/item/${p.Id}${slideshow ? '?slideshow=1' : ''}`, []);
  const go = useCallback((p?: BaseItemDto) => p && navigate(address(p, playing), { replace: true }), [navigate, address, playing]);
  const toggleSlideshow = useCallback(() => navigate(address(item, !playing), { replace: true }), [navigate, address, item, playing]);
  // A slideshow starts over after the last photo.
  const upcoming = next ?? (list.length > 1 ? list[0] : undefined);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(prev);
      else if (e.key === 'ArrowRight') go(next);
      else if (e.key === ' ') {
        e.preventDefault();
        toggleSlideshow();
      } else if (e.key === 'Escape') navigate(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, prev, next, navigate, toggleSlideshow]);

  const photoSrc = useCallback(
    (p: BaseItemDto) => api.imageUrl(p.Id, 'Primary', { tag: p.ImageTags?.Primary, maxWidth: 2560, quality: 95 }),
    [api],
  );
  const src = photoSrc(item);

  useEffect(() => {
    if (!playing || !upcoming) return;
    // Fetch the next photo ahead of time, so it is there when its turn comes.
    const preload = new Image();
    preload.src = photoSrc(upcoming);
    const timer = window.setTimeout(() => go(upcoming), SLIDESHOW_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [playing, upcoming, go, photoSrc]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black">
      <Img src={src} className="max-h-full max-w-full object-contain" fallback={<span className="text-muted">Image unavailable</span>} />
      <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent p-4">
        <div className="min-w-0">
          <div className="truncate font-semibold">{item.Name}</div>
          {list.length > 0 && index >= 0 && (
            <div className="text-sm text-muted">
              {index + 1} of {list.length}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {list.length > 1 && (
            <button
              onClick={toggleSlideshow}
              className={`rounded-full p-2 hover:bg-white/10 ${playing ? 'text-accent' : ''}`}
              aria-label={playing ? 'Pause slideshow' : 'Start slideshow'}
              title={playing ? 'Pause slideshow (Space)' : 'Start slideshow (Space)'}
            >
              {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
            </button>
          )}
          <button onClick={() => navigate(-1)} className="rounded-full p-2 hover:bg-white/10" aria-label="Close">
            <X size={24} />
          </button>
        </div>
      </div>
      {prev && (
        <button onClick={() => go(prev)} className="absolute left-4 rounded-full bg-black/50 p-3 hover:bg-black/80" aria-label="Previous">
          <ChevronLeft size={28} />
        </button>
      )}
      {next && (
        <button onClick={() => go(next)} className="absolute right-4 rounded-full bg-black/50 p-3 hover:bg-black/80" aria-label="Next">
          <ChevronRight size={28} />
        </button>
      )}
    </div>
  );
}

export function GenericDetails({ item }: { item: BaseItemDto }) {
  return (
    <DetailFrame
      item={item}
      header={
        <>
          <MetaLine item={item} />
          <div className="pt-2">
            <ActionBar item={item} />
          </div>
          <ExpandableText text={item.Overview} className="max-w-4xl pt-1" />
        </>
      }
    />
  );
}
