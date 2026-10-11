import { ArrowDownWideNarrow, ArrowUpNarrowWide, Filter, Shuffle } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Query } from '@/api/client';
import { useFilters, useFilterValues, useInfiniteItems, useStudios } from '@/api/queries';
import type { BaseItemDto } from '@/api/types';
import { BulkBar } from '@/components/media/BulkBar';
import { CardGrid } from '@/components/media/CardGrid';
import { ItemList } from '@/components/media/ItemList';
import { SelectionProvider } from '@/components/media/selection';
import { CardSizeSlider } from '@/components/media/CardSizeSlider';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { usePlay } from '@/player/usePlay';
import { plural } from '@/lib/format';
import { useLibraryView } from '@/lib/libraryView';
import type { LibraryConfig } from './config';
import {
  AlphabetBar,
  DropdownButton,
  FILTERS,
  HAS_RESOLUTION,
  HAS_STUDIOS,
  letterQuery,
  RESOLUTIONS,
  Toolbar,
  ViewToggle,
} from './toolbar';

export function LibraryGrid(props: { library: BaseItemDto; config: LibraryConfig; itemTypes?: string[] }) {
  return (
    <SelectionProvider>
      <LibraryItems {...props} />
    </SelectionProvider>
  );
}

function LibraryItems({ library, config, itemTypes }: { library: BaseItemDto; config: LibraryConfig; itemTypes?: string[] }) {
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
  const kind = itemTypes?.includes('BoxSet')
    ? 'collection'
    : itemTypes?.includes('MusicAlbum')
      ? 'album'
      : itemTypes?.includes('Series')
        ? 'show'
        : 'item';

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
              items={FILTERS.map((f) => ({
                label: f.label,
                checked: f.value === filter,
                onSelect: () => update({ filter: f.value || null }),
              }))}
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
                ...RESOLUTIONS.map((r) => ({
                  label: r.label,
                  checked: r.value === resolution?.value,
                  onSelect: () => update({ res: r.value }),
                })),
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
              onClick={() =>
                update({ filter: null, genre: null, year: null, rating: null, tag: null, studio: null, res: null, letter: null })
              }
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
