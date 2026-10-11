import clsx from 'clsx';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronDown, Filter, LayoutGrid, List, Shuffle } from 'lucide-react';
import { lazy, Suspense, useMemo, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { CardShape } from '@/api/images';
import type { Query } from '@/api/client';
import {
  MEDIA,
  useFilters,
  useFilterValues,
  useInfiniteItems,
  useItem,
  useItems,
  useLatest,
  useNextUp,
  useResume,
  useStudios,
} from '@/api/queries';
import type { BaseItemDto, CollectionType, ItemsResult } from '@/api/types';
import { useApi, useSession } from '@/auth/AuthProvider';
import { BulkBar } from '@/components/media/BulkBar';
import { CardGrid } from '@/components/media/CardGrid';
import { ItemList } from '@/components/media/ItemList';
import { SelectionProvider } from '@/components/media/selection';
import { CardSizeSlider } from '@/components/media/CardSizeSlider';
import { Hub } from '@/components/media/Hub';
import { LibraryIcon } from '@/components/layout/libraryIcon';
import { Button } from '@/components/ui/Button';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { PageSpinner } from '@/components/ui/Spinner';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { usePlay } from '@/player/usePlay';
import { plural } from '@/lib/format';
import { useLibraryView } from '@/lib/libraryView';
import { usePageTitle } from '@/lib/usePageTitle';

const LiveTvPage = lazy(() => import('./LiveTv'));

type TabId = 'recommended' | 'library' | 'collections' | 'genres' | 'albums' | 'artists' | 'browse';

interface TabDef {
  id: TabId;
  label: string;
}

interface SortDef {
  label: string;
  value: string;
  defaultOrder: 'Ascending' | 'Descending';
}

const SORT_TITLE: SortDef = { label: 'Title', value: 'SortName', defaultOrder: 'Ascending' };
const SORT_ADDED: SortDef = { label: 'Date Added', value: 'DateCreated,SortName', defaultOrder: 'Descending' };
const SORT_RELEASE: SortDef = { label: 'Release Date', value: 'PremiereDate,ProductionYear,SortName', defaultOrder: 'Descending' };
const SORT_YEAR: SortDef = { label: 'Year', value: 'ProductionYear,SortName', defaultOrder: 'Descending' };
const SORT_RATING: SortDef = { label: 'Audience Rating', value: 'CommunityRating,SortName', defaultOrder: 'Descending' };
const SORT_CRITIC: SortDef = { label: 'Critic Rating', value: 'CriticRating,SortName', defaultOrder: 'Descending' };
const SORT_RUNTIME: SortDef = { label: 'Duration', value: 'Runtime,SortName', defaultOrder: 'Ascending' };
const SORT_PLAYED: SortDef = { label: 'Last Played', value: 'DatePlayed,SortName', defaultOrder: 'Descending' };
const SORT_PLAYCOUNT: SortDef = { label: 'Plays', value: 'PlayCount,SortName', defaultOrder: 'Descending' };
const SORT_ARTIST: SortDef = { label: 'Album Artist', value: 'AlbumArtist,SortName', defaultOrder: 'Ascending' };
const SORT_RANDOM: SortDef = { label: 'Randomly', value: 'Random', defaultOrder: 'Ascending' };

interface LibraryConfig {
  tabs: TabDef[];
  /** Item types for the main "Library" grid. */
  itemTypes?: string[];
  sorts: SortDef[];
  shape: CardShape;
  watchFilters: boolean;
}

function configFor(type: CollectionType | null | undefined): LibraryConfig {
  switch (type) {
    case 'movies':
      return {
        tabs: [
          { id: 'recommended', label: 'Recommended' },
          { id: 'library', label: 'Library' },
          { id: 'collections', label: 'Collections' },
          { id: 'genres', label: 'Categories' },
        ],
        itemTypes: ['Movie'],
        sorts: [SORT_TITLE, SORT_ADDED, SORT_RELEASE, SORT_RATING, SORT_CRITIC, SORT_RUNTIME, SORT_PLAYED, SORT_RANDOM],
        shape: 'poster',
        watchFilters: true,
      };
    case 'tvshows':
      return {
        tabs: [
          { id: 'recommended', label: 'Recommended' },
          { id: 'library', label: 'Library' },
          { id: 'genres', label: 'Categories' },
        ],
        itemTypes: ['Series'],
        sorts: [SORT_TITLE, { ...SORT_ADDED, value: 'DateLastContentAdded,SortName' }, SORT_RELEASE, SORT_RATING, SORT_PLAYED, SORT_RANDOM],
        shape: 'poster',
        watchFilters: true,
      };
    case 'music':
      return {
        tabs: [
          { id: 'recommended', label: 'Recommended' },
          { id: 'albums', label: 'Albums' },
          { id: 'artists', label: 'Artists' },
          { id: 'genres', label: 'Genres' },
        ],
        itemTypes: ['MusicAlbum'],
        sorts: [SORT_TITLE, SORT_ARTIST, SORT_YEAR, SORT_ADDED, SORT_PLAYED, SORT_PLAYCOUNT, SORT_RANDOM],
        shape: 'square',
        watchFilters: false,
      };
    case 'musicvideos':
      return {
        tabs: [{ id: 'library', label: 'Library' }],
        itemTypes: ['MusicVideo'],
        sorts: [SORT_TITLE, SORT_ADDED, SORT_YEAR, SORT_RANDOM],
        shape: 'landscape',
        watchFilters: true,
      };
    case 'boxsets':
      return {
        tabs: [{ id: 'library', label: 'Collections' }],
        itemTypes: ['BoxSet'],
        sorts: [SORT_TITLE, SORT_ADDED, SORT_RANDOM],
        shape: 'poster',
        watchFilters: false,
      };
    case 'playlists':
      return {
        tabs: [{ id: 'library', label: 'Playlists' }],
        itemTypes: ['Playlist'],
        sorts: [SORT_TITLE, SORT_ADDED],
        shape: 'square',
        watchFilters: false,
      };
    case 'books':
      return {
        tabs: [
          { id: 'browse', label: 'Folders' },
          { id: 'library', label: 'All Books' },
        ],
        itemTypes: ['Book', 'AudioBook'],
        sorts: [SORT_TITLE, SORT_ADDED, SORT_YEAR],
        shape: 'poster',
        watchFilters: false,
      };
    case 'photos':
      return { tabs: [{ id: 'browse', label: 'Browse' }], sorts: [SORT_TITLE, SORT_ADDED], shape: 'square', watchFilters: false };
    case 'homevideos':
      return {
        tabs: [{ id: 'browse', label: 'Browse' }],
        sorts: [SORT_TITLE, SORT_ADDED, SORT_RELEASE],
        shape: 'landscape',
        watchFilters: true,
      };
    default:
      return {
        tabs: [
          { id: 'browse', label: 'Browse' },
          { id: 'library', label: 'All Videos' },
        ],
        itemTypes: ['Movie', 'Series', 'Video', 'MusicVideo'],
        sorts: [SORT_TITLE, SORT_ADDED, SORT_RELEASE],
        shape: 'poster',
        watchFilters: true,
      };
  }
}

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'IsUnplayed', label: 'Unwatched' },
  { value: 'IsPlayed', label: 'Watched' },
  { value: 'IsResumable', label: 'In Progress' },
  { value: 'IsFavorite', label: 'Favorites' },
];

const RESOLUTIONS = [
  { value: '4k', label: '4K', query: { is4K: true } },
  { value: 'hd', label: 'HD', query: { isHd: true, is4K: false } },
  { value: 'sd', label: 'SD', query: { isHd: false } },
] as const;
/** Item types that are single video files, so they have a resolution. */
const HAS_RESOLUTION = new Set(['Movie', 'Video', 'MusicVideo', 'Episode']);
/** Item types whose metadata carries studios. */
const HAS_STUDIOS = new Set(['Movie', 'Series']);

const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

/** The part of an items query that picks titles by their first letter ('#' = everything before A). */
export function letterQuery(letter: string): Query {
  if (!letter) return {};
  return letter === '#' ? { nameLessThan: 'A' } : { nameStartsWith: letter };
}

/** A–Z strip to jump to a letter in a list sorted by title. */
function AlphabetBar({ value, onChange }: { value: string; onChange: (letter: string | null) => void }) {
  return (
    <div className="scrollbar-none -mx-1 mb-4 flex gap-0.5 overflow-x-auto" role="group" aria-label="Jump to a letter" data-testid="alphabet-bar">
      {LETTERS.map((l) => (
        <button
          key={l}
          onClick={() => onChange(value === l ? null : l)}
          aria-pressed={value === l}
          title={l === '#' ? 'Titles that start with a number or symbol' : `Titles that start with ${l}`}
          className={clsx(
            'h-7 min-w-7 shrink-0 rounded px-1.5 text-xs font-semibold transition-colors',
            value === l ? 'bg-accent text-accent-ink' : 'text-muted hover:bg-white/10 hover:text-fg',
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/** Switches a library between cards and rows. */
function ViewToggle() {
  const [view, setView] = useLibraryView();
  return (
    <div className="flex rounded-md bg-white/5 p-0.5" role="group" aria-label="Layout">
      {(
        [
          ['grid', 'Grid', <LayoutGrid size={15} key="g" />],
          ['list', 'List', <List size={15} key="l" />],
        ] as const
      ).map(([value, label, icon]) => (
        <button
          key={value}
          onClick={() => setView(value)}
          aria-pressed={view === value}
          aria-label={`${label} view`}
          title={`${label} view`}
          className={clsx('flex h-7 w-8 items-center justify-center rounded', view === value ? 'bg-white/15 text-fg' : 'text-muted hover:text-fg')}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}

function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

function DropdownButton({ label, active, items, icon }: { label: ReactNode; active?: boolean; items: MenuItem[]; icon?: ReactNode }) {
  return (
    <Menu
      align="left"
      items={items}
      trigger={({ toggle, open }) => (
        <button
          onClick={toggle}
          aria-expanded={open}
          className={clsx(
            'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors',
            active ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-white/10 hover:text-fg',
          )}
        >
          {icon}
          {label}
          <ChevronDown size={14} />
        </button>
      )}
    />
  );
}

export default function LibraryPage() {
  const { id = '' } = useParams();
  const { data: library, isLoading, error, refetch } = useItem(id);
  const [params, setParams] = useSearchParams();
  const config = useMemo(() => configFor(library?.CollectionType), [library?.CollectionType]);
  usePageTitle(library?.Name);

  if (isLoading) return <PageSpinner />;
  if (error || !library) return <ErrorState error={error ?? 'Library not found'} onRetry={() => refetch()} />;

  if (library.CollectionType === 'livetv') {
    return (
      <Suspense fallback={<PageSpinner />}>
        <LiveTvPage library={library} />
      </Suspense>
    );
  }

  const tabParam = params.get('tab') as TabId | null;
  const tab: TabId = config.tabs.some((t) => t.id === tabParam) ? tabParam! : config.tabs[0].id;

  const setTab = (t: TabId) => {
    const next = new URLSearchParams();
    next.set('tab', t);
    setParams(next, { replace: true });
  };

  return (
    <div className="pb-10">
      <div className="sticky top-0 z-20 border-b border-white/5 bg-base-900/90 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-8 lg:px-10">
          <div className="flex items-center gap-2.5 text-lg font-semibold">
            <span className="text-accent">
              <LibraryIcon type={library.CollectionType} size={22} />
            </span>
            {library.Name}
          </div>
          {config.tabs.length > 1 && (
            <div className="flex gap-1 overflow-x-auto scrollbar-none">
              {config.tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={clsx(
                    'relative h-9 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors',
                    tab === t.id ? 'text-fg' : 'text-muted hover:text-fg',
                  )}
                >
                  {t.label}
                  {tab === t.id && <span className="absolute inset-x-3 -bottom-[13px] h-[3px] rounded-t bg-accent" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {tab === 'recommended' && <Recommended library={library} />}
      {tab === 'library' && <LibraryGrid key="library" library={library} config={config} itemTypes={config.itemTypes} />}
      {tab === 'albums' && <LibraryGrid key="albums" library={library} config={config} itemTypes={['MusicAlbum']} />}
      {tab === 'artists' && <ArtistsGrid library={library} />}
      {tab === 'collections' && (
        <LibraryGrid
          key="collections"
          library={library}
          config={{ ...config, sorts: [SORT_TITLE, SORT_ADDED], watchFilters: false }}
          itemTypes={['BoxSet']}
        />
      )}
      {tab === 'genres' && <GenreGrid library={library} />}
      {tab === 'browse' && (
        <FolderGrid
          parentId={library.Id}
          shape={config.shape}
          sorts={config.sorts}
          shuffleItem={library.CollectionType === 'photos' || library.CollectionType === 'books' ? undefined : library}
        />
      )}
    </div>
  );
}

function Recommended({ library }: { library: BaseItemDto }) {
  const type = library.CollectionType;
  const latest = useLatest(library.Id, { limit: 24 });
  const resume = useResume(library.Id, type === 'music' ? ['Audio'] : ['Video']);
  const nextUp = useNextUp({ parentId: library.Id, enabled: type === 'tvshows' });
  const itemType = type === 'movies' ? 'Movie' : type === 'tvshows' ? 'Series' : 'MusicAlbum';

  const base: Query = { parentId: library.Id, recursive: true, includeItemTypes: itemType, limit: 24 };
  const released = useItems({ ...base, sortBy: 'PremiereDate,ProductionYear', sortOrder: 'Descending' }, { enabled: type !== 'music' });
  const topRated = useItems(
    { ...base, sortBy: 'CommunityRating', sortOrder: 'Descending', filters: type === 'music' ? undefined : 'IsUnplayed', minCommunityRating: 1 },
    { enabled: type !== 'music' },
  );
  const recentlyPlayed = useItems(
    { parentId: library.Id, recursive: true, includeItemTypes: type === 'music' ? 'MusicAlbum' : itemType, filters: 'IsPlayed', sortBy: 'DatePlayed', sortOrder: 'Descending', limit: 24 },
    { key: ['recentlyPlayed'] },
  );
  const newEpisodes = useItems(
    { parentId: library.Id, recursive: true, includeItemTypes: 'Episode', sortBy: 'PremiereDate', sortOrder: 'Descending', limit: 24, filters: 'IsUnplayed' },
    { enabled: type === 'tvshows' },
  );
  const random = useItems({ ...base, sortBy: 'Random' }, { key: ['random', library.Id] });
  const mostPlayed = useItems(
    { parentId: library.Id, recursive: true, includeItemTypes: 'Audio', sortBy: 'PlayCount', sortOrder: 'Descending', filters: 'IsPlayed', limit: 24 },
    { enabled: type === 'music' },
  );

  const continueItems = useMemo(() => {
    const items = [...(resume.data?.Items ?? [])];
    const seen = new Set(items.map((i) => i.SeriesId).filter(Boolean));
    for (const ep of nextUp.data?.Items ?? []) {
      if (ep.SeriesId && seen.has(ep.SeriesId)) continue;
      seen.add(ep.SeriesId);
      items.push(ep);
    }
    return items;
  }, [resume.data, nextUp.data]);

  const square = type === 'music';
  const noContent =
    !latest.isLoading && (latest.data?.length ?? 0) === 0 && !random.isLoading && (random.data?.Items.length ?? 0) === 0;

  if (noContent) {
    return (
      <EmptyState title="This library is empty">
        Add media to the library folders and run a library scan from the dashboard.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-9 pt-6">
      <Hub
        title={square ? 'Continue Listening' : 'Continue Watching'}
        items={continueItems}
        shape={square ? 'square' : 'landscape'}
      />
      <Hub
        title={type === 'tvshows' ? 'Recently Added Episodes' : 'Recently Added'}
        items={latest.data}
        loading={latest.isLoading}
        shape={square ? 'square' : 'poster'}
      />
      {type === 'tvshows' && <Hub title="New Episodes" items={newEpisodes.data?.Items} shape="landscape" />}
      {type !== 'music' && <Hub title="Recently Released" items={released.data?.Items} shape="poster" />}
      {type === 'music' && <Hub title="Recently Played" items={recentlyPlayed.data?.Items} shape="square" />}
      {type === 'music' && <Hub title="Most Played" items={mostPlayed.data?.Items} shape="square" />}
      {type !== 'music' && <Hub title="Top Rated Unwatched" items={topRated.data?.Items} shape="poster" />}
      {type !== 'music' && <Hub title="Recently Watched" items={recentlyPlayed.data?.Items} shape="poster" />}
      <Hub title={type === 'music' ? 'Rediscover' : 'Random Picks'} items={random.data?.Items} shape={square ? 'square' : 'poster'} />
    </div>
  );
}

function LibraryGrid(props: { library: BaseItemDto; config: LibraryConfig; itemTypes?: string[] }) {
  return (
    <SelectionProvider>
      <LibraryItems {...props} />
    </SelectionProvider>
  );
}

function LibraryItems({
  library,
  config,
  itemTypes,
}: {
  library: BaseItemDto;
  config: LibraryConfig;
  itemTypes?: string[];
}) {
  const [params, setParams] = useSearchParams();
  const play = usePlay();
  const [view] = useLibraryView();
  const filters = useFilters(library.Id, itemTypes);
  const values = useFilterValues(library.Id, itemTypes);
  const studios = useStudios(library.Id, itemTypes, Boolean(itemTypes?.some((t) => HAS_STUDIOS.has(t))));

  const sort = config.sorts.find((s) => s.value === params.get('sort')) ?? config.sorts[0];
  const order = (params.get('order') as 'Ascending' | 'Descending' | null) ?? sort.defaultOrder;
  const filter = params.get('filter') ?? '';
  const genre = params.get('genre') ?? '';
  const year = params.get('year') ?? '';
  const rating = params.get('rating') ?? '';
  const tag = params.get('tag') ?? '';
  const studio = params.get('studio') ?? '';
  const resolution = RESOLUTIONS.find((r) => r.value === params.get('res'));
  // Jumping to a letter only makes sense in a list that is in alphabetical order.
  const byTitle = sort.value === 'SortName';
  const letter = byTitle ? (params.get('letter') ?? '') : '';
  const filtered = Boolean(filter || genre || year || rating || tag || studio || resolution || letter);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  const query: Query = {
    parentId: library.Id,
    recursive: true,
    includeItemTypes: itemTypes,
    sortBy: sort.value,
    sortOrder: order,
    filters: filter || undefined,
    genreIds: genre || undefined,
    years: year || undefined,
    officialRatings: rating || undefined,
    tags: tag || undefined,
    studioIds: studio || undefined,
    ...resolution?.query,
    ...letterQuery(letter),
  };
  const result = useInfiniteItems(query);
  const items = useMemo(() => result.data?.pages.flatMap((p) => p.Items) ?? [], [result.data]);
  const total = result.data?.pages[0]?.TotalRecordCount ?? 0;
  const genreName = filters.data?.Genres?.find((g) => g.Id === genre)?.Name;
  const years = [...(values.data?.Years ?? [])].sort((a, b) => b - a);
  const ratings = values.data?.OfficialRatings ?? [];
  const tags = values.data?.Tags ?? filters.data?.Tags ?? [];
  const studioList = studios.data?.Items ?? [];
  const hasResolution = Boolean(itemTypes?.some((t) => HAS_RESOLUTION.has(t)));

  const baseWidth = config.shape === 'landscape' ? 250 : config.shape === 'square' ? 160 : 145;
  const kind = itemTypes?.includes('BoxSet') ? 'collection' : itemTypes?.includes('MusicAlbum') ? 'album' : itemTypes?.includes('Series') ? 'show' : 'item';

  return (
    <div className="px-4 pt-5 sm:px-8 lg:px-10">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Toolbar>
          <span className="mr-2 text-sm text-muted">{result.isLoading ? '…' : plural(total, kind)}</span>
          <DropdownButton
            label={sort.label}
            icon={order === 'Ascending' ? <ArrowUpNarrowWide size={15} /> : <ArrowDownWideNarrow size={15} />}
            items={[
              ...config.sorts.map((s) => ({
                label: s.label,
                checked: s.value === sort.value,
                onSelect: () =>
                  s.value === sort.value
                    ? update({ order: order === 'Ascending' ? 'Descending' : 'Ascending' })
                    : update({ sort: s.value, order: s.defaultOrder }),
              })),
              { divider: true, label: '' },
              { label: 'Ascending', checked: order === 'Ascending', onSelect: () => update({ order: 'Ascending' }) },
              { label: 'Descending', checked: order === 'Descending', onSelect: () => update({ order: 'Descending' }) },
            ]}
          />
          {config.watchFilters && (
            <DropdownButton
              label={FILTERS.find((f) => f.value === filter)?.label ?? 'All'}
              active={Boolean(filter)}
              icon={<Filter size={14} />}
              items={FILTERS.map((f) => ({ label: f.label, checked: f.value === filter, onSelect: () => update({ filter: f.value || null }) }))}
            />
          )}
          {(filters.data?.Genres?.length ?? 0) > 0 && (
            <DropdownButton
              label={genreName ?? 'Genre'}
              active={Boolean(genre)}
              items={[
                { label: 'All genres', checked: !genre, onSelect: () => update({ genre: null }) },
                { divider: true, label: '' },
                ...(filters.data?.Genres ?? []).map((g) => ({
                  label: g.Name,
                  checked: g.Id === genre,
                  onSelect: () => update({ genre: g.Id }),
                })),
              ]}
            />
          )}
          {years.length > 1 && (
            <DropdownButton
              label={year || 'Year'}
              active={Boolean(year)}
              items={[
                { label: 'All years', checked: !year, onSelect: () => update({ year: null }) },
                { divider: true, label: '' },
                ...years.map((y) => ({ label: String(y), checked: String(y) === year, onSelect: () => update({ year: String(y) }) })),
              ]}
            />
          )}
          {ratings.length > 1 && (
            <DropdownButton
              label={rating || 'Rating'}
              active={Boolean(rating)}
              items={[
                { label: 'All ratings', checked: !rating, onSelect: () => update({ rating: null }) },
                { divider: true, label: '' },
                ...ratings.map((r) => ({ label: r, checked: r === rating, onSelect: () => update({ rating: r }) })),
              ]}
            />
          )}
          {hasResolution && (
            <DropdownButton
              label={resolution?.label ?? 'Resolution'}
              active={Boolean(resolution)}
              items={[
                { label: 'Any resolution', checked: !resolution, onSelect: () => update({ res: null }) },
                { divider: true, label: '' },
                ...RESOLUTIONS.map((r) => ({ label: r.label, checked: r.value === resolution?.value, onSelect: () => update({ res: r.value }) })),
              ]}
            />
          )}
          {tags.length > 0 && (
            <DropdownButton
              label={tag || 'Tag'}
              active={Boolean(tag)}
              items={[
                { label: 'All tags', checked: !tag, onSelect: () => update({ tag: null }) },
                { divider: true, label: '' },
                ...tags.map((t) => ({ label: t, checked: t === tag, onSelect: () => update({ tag: t }) })),
              ]}
            />
          )}
          {studioList.length > 1 && (
            <DropdownButton
              label={studioList.find((s) => s.Id === studio)?.Name ?? 'Studio'}
              active={Boolean(studio)}
              items={[
                { label: 'All studios', checked: !studio, onSelect: () => update({ studio: null }) },
                { divider: true, label: '' },
                ...studioList.map((s) => ({ label: s.Name ?? '', checked: s.Id === studio, onSelect: () => update({ studio: s.Id }) })),
              ]}
            />
          )}
          {filtered && (
            <button
              onClick={() => update({ filter: null, genre: null, year: null, rating: null, tag: null, studio: null, res: null, letter: null })}
              className="text-sm text-accent hover:underline"
            >
              Clear
            </button>
          )}
        </Toolbar>
        <Toolbar>
          {total > 0 && !itemTypes?.includes('BoxSet') && !itemTypes?.includes('Playlist') && (
            <Button size="sm" variant="ghost" icon={<Shuffle size={15} />} onClick={() => play(library, { shuffle: true })}>
              Shuffle
            </Button>
          )}
          <ViewToggle />
          {view === 'grid' && <CardSizeSlider />}
        </Toolbar>
      </div>

      {byTitle && <AlphabetBar value={letter} onChange={(l) => update({ letter: l })} />}

      {result.error ? (
        <ErrorState error={result.error} onRetry={() => result.refetch()} />
      ) : !result.isLoading && items.length === 0 ? (
        <EmptyState title="Nothing here">
          {filtered ? 'No items match the current filters.' : 'This library doesn’t contain any items yet.'}
        </EmptyState>
      ) : view === 'list' ? (
        <ItemList
          items={items}
          loading={result.isLoading}
          hasMore={result.hasNextPage}
          loadingMore={result.isFetchingNextPage}
          onLoadMore={() => !result.isFetchingNextPage && result.fetchNextPage()}
        />
      ) : (
        <CardGrid
          items={items}
          shape={config.shape}
          minWidth={baseWidth}
          loading={result.isLoading}
          hasMore={result.hasNextPage}
          loadingMore={result.isFetchingNextPage}
          onLoadMore={() => !result.isFetchingNextPage && result.fetchNextPage()}
        />
      )}
      <BulkBar allItems={items} />
    </div>
  );
}

function ArtistsGrid({ library }: { library: BaseItemDto }) {
  const result = useInfiniteItems({ parentId: library.Id, sortBy: 'SortName', sortOrder: 'Ascending' }, true, '/Artists/AlbumArtists');
  const items = useMemo(() => result.data?.pages.flatMap((p) => p.Items) ?? [], [result.data]);
  const total = result.data?.pages[0]?.TotalRecordCount ?? 0;
  return (
    <div className="px-4 pt-5 sm:px-8 lg:px-10">
      <div className="mb-5 text-sm text-muted">{result.isLoading ? '…' : plural(total, 'artist')}</div>
      {result.error ? (
        <ErrorState error={result.error} onRetry={() => result.refetch()} />
      ) : !result.isLoading && items.length === 0 ? (
        <EmptyState title="No artists" />
      ) : (
        <CardGrid
          items={items}
          shape="square"
          minWidth={150}
          loading={result.isLoading}
          hasMore={result.hasNextPage}
          loadingMore={result.isFetchingNextPage}
          onLoadMore={() => !result.isFetchingNextPage && result.fetchNextPage()}
        />
      )}
    </div>
  );
}

const GENRE_COLORS = [
  'from-purple-600/80 to-sky-800/80',
  'from-sky-600/80 to-indigo-900/80',
  'from-emerald-600/80 to-teal-900/80',
  'from-rose-600/80 to-fuchsia-900/80',
  'from-violet-600/80 to-purple-900/80',
  'from-lime-600/80 to-green-900/80',
  'from-cyan-600/80 to-blue-900/80',
  'from-red-600/80 to-rose-900/80',
];

function GenreGrid({ library }: { library: BaseItemDto }) {
  const api = useApi();
  const { userId } = useSession();
  const [, setParams] = useSearchParams();
  const isMusic = library.CollectionType === 'music';
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [MEDIA, 'genres', library.Id],
    queryFn: () =>
      api.get<ItemsResult>(isMusic ? '/MusicGenres' : '/Genres', {
        parentId: library.Id,
        userId,
        sortBy: 'SortName',
        sortOrder: 'Ascending',
      }),
  });

  if (isLoading) return <PageSpinner />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!data?.Items.length) return <EmptyState title="No categories" />;

  return (
    <div className="grid gap-4 px-4 pt-6 sm:px-8 lg:px-10" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
      {data.Items.map((g, i) => (
        <button
          key={g.Id}
          onClick={() => {
            const next = new URLSearchParams();
            next.set('tab', isMusic ? 'albums' : 'library');
            next.set('genre', g.Id);
            setParams(next);
          }}
          className={clsx(
            'group relative flex aspect-[16/7] items-end overflow-hidden rounded-lg bg-gradient-to-br p-4 text-left shadow-lg ring-white/0 transition hover:ring-2 hover:ring-accent',
            GENRE_COLORS[i % GENRE_COLORS.length],
          )}
        >
          <span className="text-lg font-bold drop-shadow">{g.Name}</span>
        </button>
      ))}
    </div>
  );
}

interface FolderGridProps {
  parentId: string;
  shape: CardShape;
  sorts?: SortDef[];
  /** Folder or library to shuffle; plays everything below it, including subfolders. */
  shuffleItem?: BaseItemDto;
}

export function FolderGrid(props: FolderGridProps) {
  return (
    <SelectionProvider>
      <FolderItems {...props} />
    </SelectionProvider>
  );
}

function FolderItems({ parentId, shape, sorts = [SORT_TITLE, SORT_ADDED], shuffleItem }: FolderGridProps) {
  const play = usePlay();
  const [view] = useLibraryView();
  const [params, setParams] = useSearchParams();
  const sort = sorts.find((s) => s.value === params.get('sort')) ?? sorts[0];
  const order = (params.get('order') as 'Ascending' | 'Descending' | null) ?? sort.defaultOrder;

  const result = useInfiniteItems({
    parentId,
    sortBy: `IsFolder,${sort.value}`,
    sortOrder: `Descending,${order}`,
  });
  const items = useMemo(() => result.data?.pages.flatMap((p) => p.Items) ?? [], [result.data]);
  const total = result.data?.pages[0]?.TotalRecordCount ?? 0;
  const baseWidth = shape === 'landscape' ? 250 : shape === 'square' ? 160 : 145;

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    setParams(next, { replace: true });
  };

  return (
    <div className="px-4 pt-5 sm:px-8 lg:px-10">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Toolbar>
          <span className="mr-2 text-sm text-muted">{result.isLoading ? '…' : plural(total, 'item')}</span>
          <DropdownButton
            label={sort.label}
            icon={order === 'Ascending' ? <ArrowUpNarrowWide size={15} /> : <ArrowDownWideNarrow size={15} />}
            items={sorts.map((s) => ({
              label: s.label,
              checked: s.value === sort.value,
              onSelect: () =>
                s.value === sort.value
                  ? update({ order: order === 'Ascending' ? 'Descending' : 'Ascending' })
                  : update({ sort: s.value, order: s.defaultOrder }),
            }))}
          />
        </Toolbar>
        <Toolbar>
          {shuffleItem && total > 0 && (
            <Button size="sm" variant="ghost" icon={<Shuffle size={15} />} onClick={() => play(shuffleItem, { shuffle: true })}>
              Shuffle
            </Button>
          )}
          <ViewToggle />
          {view === 'grid' && <CardSizeSlider />}
        </Toolbar>
      </div>
      {result.error ? (
        <ErrorState error={result.error} onRetry={() => result.refetch()} />
      ) : !result.isLoading && items.length === 0 ? (
        <EmptyState title="This folder is empty" />
      ) : view === 'list' ? (
        <ItemList
          items={items}
          loading={result.isLoading}
          hasMore={result.hasNextPage}
          loadingMore={result.isFetchingNextPage}
          onLoadMore={() => !result.isFetchingNextPage && result.fetchNextPage()}
        />
      ) : (
        <CardGrid
          items={items}
          shape={shape}
          minWidth={baseWidth}
          loading={result.isLoading}
          hasMore={result.hasNextPage}
          loadingMore={result.isFetchingNextPage}
          onLoadMore={() => !result.isFetchingNextPage && result.fetchNextPage()}
        />
      )}
      <BulkBar allItems={items} />
    </div>
  );
}
