import { ArrowDownWideNarrow, ArrowUpNarrowWide, Filter, Shuffle } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Query } from '@/api/client';
import { useFilters, useFilterValues, useInfiniteItems, useLetterIndex, useStudios } from '@/api/queries';
import type { BaseItemDto } from '@/api/types';
import { BulkBar } from '@/components/media/BulkBar';
import { CardGrid } from '@/components/media/CardGrid';
import { ItemList } from '@/components/media/ItemList';
import { SelectionProvider, useSelection } from '@/components/media/selection';
import { CardSizeSlider } from '@/components/media/CardSizeSlider';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
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
  MultiFilter,
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
  // These take several values: the address carries one "genre=" for each.
  const genre = params.getAll('genre');
  const year = params.getAll('year');
  const rating = params.getAll('rating');
  const tag = params.getAll('tag');
  const studio = params.getAll('studio');
  const resolution = RESOLUTIONS.find((r) => r.value === params.get('res'));
  // Jumping to a letter only makes sense in a list that is in alphabetical order.
  const byTitle = sort.value === 'SortName';
  const letter = byTitle ? (params.get('letter') ?? '') : '';
  const filtered = Boolean(filter || genre.length || year.length || rating.length || tag.length || studio.length || resolution);

  const update = (patch: Record<string, string | string[] | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      next.delete(k);
      for (const value of Array.isArray(v) ? v : v ? [v] : []) next.append(k, value);
    }
    // A letter belongs to the list it was picked in; any other list starts at the top again.
    if (!('letter' in patch)) next.delete('letter');
    setParams(next, { replace: true });
  };

  const query: Query = {
    parentId: library.Id,
    recursive: true,
    includeItemTypes: itemTypes,
    sortBy: sort.value,
    sortOrder: order,
    filters: filter || undefined,
    // Ids and years are separated by commas, names by "|" (a name can contain a comma).
    genreIds: genre,
    years: year,
    officialRatings: rating.join('|'),
    tags: tag.join('|'),
    studioIds: studio,
    ...resolution?.query,
  };
  // Picking a letter keeps the whole list and starts it at that letter; earlier titles load on scrolling up.
  const jump = useLetterIndex(query, letter, order);
  // The list begins at the start of the row the letter is in, so that row is the same one as in
  // the whole list and nothing shifts sideways when the titles above it arrive.
  const listRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(0);
  useLayoutEffect(() => {
    const grid = listRef.current?.querySelector(':scope > .grid');
    setColumns(grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 1);
    // Measured again for each letter, as the window may have been resized since the last one.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [letter, view]);
  const start = letter && jump.data !== undefined && columns ? jump.data - (jump.data % columns) : 0;
  const result = useInfiniteItems(query, !letter || (jump.data !== undefined && columns > 0), '/Items', start, columns || 1);
  const loading = result.isLoading || (Boolean(letter) && (jump.isLoading || !columns));
  const items = useMemo(() => result.data?.pages.flatMap((p) => p.Items) ?? [], [result.data]);
  const total = result.data?.pages[0]?.TotalRecordCount ?? 0;

  const selection = useSelection();
  useEffect(() => selection?.setOrder(items), [selection, items]);

  // Titles added above the ones on screen must not push those down, so the page is scrolled by
  // the height that was added. (Browsers that do this themselves are told not to, below.)
  const before = useRef<{ first?: string; height: number }>({ height: 0 });
  const firstId = items[0]?.Id;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const height = list.offsetHeight;
    const prev = before.current;
    const prepended = prev.first !== undefined && prev.first !== firstId && items.some((i) => i.Id === prev.first);
    if (prepended) document.getElementById('main-scroll')?.scrollBy({ top: height - prev.height });
    before.current = { first: firstId, height };
  }, [firstId, items]);

  // A letter puts the top of the list right under the A–Z bar; taking the letter away goes back to the start.
  const jumped = letter ? jump.data : undefined;
  const lastLetter = useRef<string | null>(null);
  useEffect(() => {
    const scroller = document.getElementById('main-scroll');
    const list = listRef.current;
    if (letter && jumped !== undefined && scroller && list) {
      // Where the bar ends once it sticks under the library's header, which is where it will be.
      const header =
        scroller.querySelector('[data-library-header]')?.getBoundingClientRect().bottom ?? scroller.getBoundingClientRect().top;
      const bar = scroller.querySelector<HTMLElement>('[data-testid="alphabet-bar"]')?.offsetHeight ?? 0;
      scroller.scrollBy({ top: list.getBoundingClientRect().top - (header + bar + 8) });
    } else if (!letter && lastLetter.current) {
      scroller?.scrollTo({ top: 0 });
    }
    lastLetter.current = letter;
    // Also for another letter that begins at the same position.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [letter, jumped]);

  const earlierRef = useRef<HTMLDivElement>(null);
  const { hasPreviousPage, isFetchingPreviousPage, fetchPreviousPage } = result;
  useEffect(() => {
    const el = earlierRef.current;
    if (!el || !hasPreviousPage || isFetchingPreviousPage) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && void fetchPreviousPage(), {
      rootMargin: '300px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasPreviousPage, isFetchingPreviousPage, fetchPreviousPage]);

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
          <span className="mr-2 text-sm text-muted">{loading ? '…' : plural(total, kind)}</span>
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
            <MultiFilter
              name="Genre"
              plural="genres"
              options={(filters.data?.Genres ?? []).map((g) => ({ value: g.Id, label: g.Name }))}
              selected={genre}
              onChange={(v) => update({ genre: v })}
            />
          )}
          {years.length > 1 && (
            <MultiFilter
              name="Year"
              plural="years"
              options={years.map((y) => ({ value: String(y), label: String(y) }))}
              selected={year}
              onChange={(v) => update({ year: v })}
            />
          )}
          {ratings.length > 1 && (
            <MultiFilter
              name="Rating"
              plural="ratings"
              options={ratings.map((r) => ({ value: r, label: r }))}
              selected={rating}
              onChange={(v) => update({ rating: v })}
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
            <MultiFilter
              name="Tag"
              plural="tags"
              options={tags.map((t) => ({ value: t, label: t }))}
              selected={tag}
              onChange={(v) => update({ tag: v })}
            />
          )}
          {studioList.length > 1 && (
            <MultiFilter
              name="Studio"
              plural="studios"
              options={studioList.map((st) => ({ value: st.Id, label: st.Name ?? '' }))}
              selected={studio}
              onChange={(v) => update({ studio: v })}
            />
          )}
          {filtered && (
            <button
              onClick={() => update({ filter: null, genre: null, year: null, rating: null, tag: null, studio: null, res: null })}
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
      ) : !loading && items.length === 0 ? (
        <EmptyState title="Nothing here">
          {filtered ? 'No items match the current filters.' : 'This library doesn’t contain any items yet.'}
        </EmptyState>
      ) : (
        <div ref={listRef} className="[overflow-anchor:none]">
          {result.hasPreviousPage && (
            <div ref={earlierRef} className="flex h-10 items-center justify-center text-accent" data-testid="earlier-titles">
              {result.isFetchingPreviousPage && <Spinner size={22} />}
            </div>
          )}
          {view === 'list' ? (
            <ItemList
              items={items}
              loading={loading}
              hasMore={result.hasNextPage}
              loadingMore={result.isFetchingNextPage}
              onLoadMore={() => !result.isFetchingNextPage && result.fetchNextPage()}
            />
          ) : (
            <CardGrid
              items={items}
              shape={config.shape}
              minWidth={baseWidth}
              loading={loading}
              hasMore={result.hasNextPage}
              loadingMore={result.isFetchingNextPage}
              onLoadMore={() => !result.isFetchingNextPage && result.fetchNextPage()}
            />
          )}
        </div>
      )}
      <BulkBar allItems={items} />
    </div>
  );
}
