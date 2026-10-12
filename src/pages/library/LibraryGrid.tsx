import { ArrowDownWideNarrow, ArrowUp, ArrowUpNarrowWide, Filter, Shuffle } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigationType, useSearchParams } from 'react-router-dom';
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
  StickyTools,
  DropdownButton,
  FILTERS,
  HAS_RESOLUTION,
  HAS_STUDIOS,
  MultiFilter,
  RESOLUTIONS,
  Toolbar,
  ViewToggle,
} from './toolbar';
import { t } from '@/i18n';

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
  const studios = useStudios(library.Id, itemTypes, Boolean(itemTypes?.some((type) => HAS_STUDIOS.has(type))));

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
  // Until it is known where the letter begins, nothing is shown: not the list it will replace either.
  const waiting = Boolean(letter) && (jump.data === undefined || !columns);
  const loading = result.isLoading || waiting;
  const items = useMemo(() => (waiting ? [] : (result.data?.pages.flatMap((p) => p.Items) ?? [])), [result.data, waiting]);
  const total = result.data?.pages[0]?.TotalRecordCount ?? 0;

  const selection = useSelection();
  useEffect(() => selection?.setOrder(items), [selection, items]);

  // Titles added above the ones on screen must not push those down, so the page is scrolled by the
  // height of the rows that were added. (Browsers that do this themselves are told not to, below.)
  // The height is worked out from the rows, as only those near the screen are in the page.
  /** Names the list on screen: the same letter at the same position is the same list, grown or not. */
  const jumpKey = `${letter}:${start}`;
  const before = useRef<{ list?: string; first?: string; earlier: number }>({ earlier: 0 });
  const [correction, setCorrection] = useState<{ by: number } | null>(null);
  /** When this component last scrolled the page itself, to tell that from the user scrolling. */
  const ownScroll = useRef(0);
  const firstId = items[0]?.Id;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const prev = before.current;
    // Only a list that grew upwards counts; another list that happens to hold the same title does not.
    const grew = prev.list === jumpKey && prev.first !== undefined && prev.first !== firstId;
    const added = grew ? items.findIndex((i) => i.Id === prev.first) : 0;
    const rows = list.querySelector<HTMLElement>(':scope > .grid, :scope > ul');
    const row = rows?.firstElementChild as HTMLElement | null;
    const earlier = list.querySelector<HTMLElement>(':scope > [data-testid="earlier-titles"]')?.offsetHeight ?? 0;
    if (added > 0 && rows && row) {
      const style = getComputedStyle(rows);
      const perRow = style.display.includes('grid') ? Math.max(1, style.gridTemplateColumns.split(' ').length) : 1;
      const pitch = row.offsetHeight + (parseFloat(style.rowGap) || 0);
      // The "earlier titles" strip goes away with the last of them. The scrolling waits for the
      // next pass, when the list has made room for the new rows; scrolling now would stop short
      // at the old end of the page.
      // oxlint-disable-next-line react/set-state-in-effect
      setCorrection({ by: Math.ceil(added / perRow) * pitch + (earlier - prev.earlier) });
    }
    before.current = { list: jumpKey, first: firstId, earlier };
  }, [firstId, items, jumpKey]);
  useLayoutEffect(() => {
    if (!correction) return;
    ownScroll.current = performance.now();
    document.getElementById('main-scroll')?.scrollBy({ top: correction.by });
  }, [correction]);

  // A letter puts the top of the list right under the A–Z bar; taking the letter away goes back to the start.
  const jumped = letter ? jump.data : undefined;
  const lastLetter = useRef<string | null>(null);
  // Coming back to this page with a letter in the address, the page returns to where it was scrolled to instead.
  const cameBack = useRef(useNavigationType() === 'POP');
  useEffect(() => {
    const scroller = document.getElementById('main-scroll');
    const list = listRef.current;
    if (letter && jumped !== undefined && cameBack.current) {
      cameBack.current = false;
    } else if (letter && jumped !== undefined && scroller && list) {
      // Where the bar ends once it sticks under the library's header, which is where it will be.
      const header =
        scroller.querySelector('[data-library-header]')?.getBoundingClientRect().bottom ?? scroller.getBoundingClientRect().top;
      const bar = scroller.querySelector<HTMLElement>('[data-library-tools]')?.offsetHeight ?? 0;
      ownScroll.current = performance.now();
      scroller.scrollBy({ top: list.getBoundingClientRect().top - (header + bar + 8) });
    } else if (!letter && lastLetter.current) {
      scroller?.scrollTo({ top: 0 });
    }
    lastLetter.current = letter;
    // Also for another letter that begins at the same position.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [letter, jumped]);

  // The titles above a letter are fetched once the user scrolls up towards them, not straight after
  // the jump: someone going from letter to letter would otherwise load a page of posters for each
  // letter that they never look at.
  // Remembered for the jump it belongs to, so the next jump starts without it.
  const [earlierFor, setEarlierFor] = useState<string | null>(null);
  const wantsEarlier = earlierFor === jumpKey;
  const { hasPreviousPage, isFetchingPreviousPage, fetchPreviousPage } = result;
  useEffect(() => {
    const scroller = document.getElementById('main-scroll');
    if (!scroller || !hasPreviousPage || wantsEarlier) return;
    let last = scroller.scrollTop;
    const onScroll = () => {
      const top = scroller.scrollTop;
      if (top < last - 1 && performance.now() - ownScroll.current > 250) setEarlierFor(jumpKey);
      last = top;
    };
    // At the very top there is nothing to scroll, so turning the wheel or pressing a key upwards counts too.
    const onWheel = (e: WheelEvent) => e.deltaY < 0 && setEarlierFor(jumpKey);
    const onKey = (e: KeyboardEvent) => ['ArrowUp', 'PageUp', 'Home'].includes(e.key) && setEarlierFor(jumpKey);
    scroller.addEventListener('scroll', onScroll, { passive: true });
    scroller.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      scroller.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [hasPreviousPage, wantsEarlier, jumpKey]);

  const earlierRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = earlierRef.current;
    if (!el || !hasPreviousPage || isFetchingPreviousPage || !wantsEarlier) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && void fetchPreviousPage(), {
      rootMargin: '600px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasPreviousPage, isFetchingPreviousPage, fetchPreviousPage, wantsEarlier]);

  const years = [...(values.data?.Years ?? [])].sort((a, b) => b - a);
  const ratings = values.data?.OfficialRatings ?? [];
  const tags = values.data?.Tags ?? filters.data?.Tags ?? [];
  const studioList = studios.data?.Items ?? [];
  const hasResolution = Boolean(itemTypes?.some((type) => HAS_RESOLUTION.has(type)));

  const baseWidth = config.shape === 'landscape' ? 250 : config.shape === 'square' ? 160 : 145;
  const kind = itemTypes?.includes('BoxSet')
    ? 'collection'
    : itemTypes?.includes('MusicAlbum')
      ? 'album'
      : itemTypes?.includes('Series')
        ? 'show'
        : 'item';

  return (
    <div className="px-4 pt-3 sm:px-8 lg:px-10">
      <StickyTools>
        <div className="scrollbar-none flex items-center justify-between gap-3 overflow-x-auto md:flex-wrap md:overflow-visible">
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
                {
                  label: t('library.libraryGrid.ascending'),
                  checked: order === 'Ascending',
                  onSelect: () => update({ order: 'Ascending' }),
                },
                {
                  label: t('library.libraryGrid.descending'),
                  checked: order === 'Descending',
                  onSelect: () => update({ order: 'Descending' }),
                },
              ]}
            />
            {config.watchFilters && (
              <DropdownButton
                label={FILTERS.find((f) => f.value === filter)?.label ?? t('library.libraryGrid.all')}
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
                kind="genre"
                options={(filters.data?.Genres ?? []).map((g) => ({ value: g.Id, label: g.Name }))}
                selected={genre}
                onChange={(v) => update({ genre: v })}
              />
            )}
            {years.length > 1 && (
              <MultiFilter
                kind="year"
                options={years.map((y) => ({ value: String(y), label: String(y) }))}
                selected={year}
                onChange={(v) => update({ year: v })}
              />
            )}
            {ratings.length > 1 && (
              <MultiFilter
                kind="rating"
                options={ratings.map((r) => ({ value: r, label: r }))}
                selected={rating}
                onChange={(v) => update({ rating: v })}
              />
            )}
            {hasResolution && (
              <DropdownButton
                label={resolution?.label ?? t('library.libraryGrid.resolution')}
                active={Boolean(resolution)}
                items={[
                  { label: t('library.libraryGrid.anyResolution'), checked: !resolution, onSelect: () => update({ res: null }) },
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
                kind="tag"
                options={tags.map((name) => ({ value: name, label: name }))}
                selected={tag}
                onChange={(v) => update({ tag: v })}
              />
            )}
            {studioList.length > 1 && (
              <MultiFilter
                kind="studio"
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
                {t('library.libraryGrid.clear')}
              </button>
            )}
          </Toolbar>
          <Toolbar>
            {total > 0 && !itemTypes?.includes('BoxSet') && !itemTypes?.includes('Playlist') && (
              <Button size="sm" variant="ghost" icon={<Shuffle size={15} />} onClick={() => play(library, { shuffle: true })}>
                {t('common.shuffle')}
              </Button>
            )}
            <ViewToggle />
            {view === 'grid' && <CardSizeSlider />}
          </Toolbar>
        </div>

        {byTitle && <AlphabetBar value={letter} onChange={(l) => update({ letter: l })} />}
      </StickyTools>

      {result.error ? (
        <ErrorState error={result.error} onRetry={() => result.refetch()} />
      ) : !loading && items.length === 0 ? (
        <EmptyState title={t('library.libraryGrid.nothingHere')}>
          {filtered ? t('library.libraryGrid.noItemsMatchTheCurrent') : t('library.libraryGrid.emptyLibrary')}
        </EmptyState>
      ) : (
        <div ref={listRef} className="[overflow-anchor:none]">
          {result.hasPreviousPage && !waiting && (
            <div ref={earlierRef} className="flex h-10 items-center justify-center text-accent" data-testid="earlier-titles">
              {result.isFetchingPreviousPage ? (
                <Spinner size={22} />
              ) : (
                <button
                  onClick={() => void result.fetchPreviousPage()}
                  className="flex items-center gap-1.5 text-xs text-muted hover:text-fg"
                >
                  <ArrowUp size={13} /> {t('library.libraryGrid.earlierTitles')}
                </button>
              )}
            </div>
          )}
          {view === 'list' ? (
            <ItemList
              items={items}
              loading={loading}
              hasMore={!waiting && result.hasNextPage}
              loadingMore={result.isFetchingNextPage}
              onLoadMore={() => !result.isFetchingNextPage && result.fetchNextPage()}
            />
          ) : (
            <CardGrid
              items={items}
              shape={config.shape}
              minWidth={baseWidth}
              loading={loading}
              hasMore={!waiting && result.hasNextPage}
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
