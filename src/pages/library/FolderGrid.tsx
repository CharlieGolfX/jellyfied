import { ArrowDownWideNarrow, ArrowUpNarrowWide, Shuffle } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CardShape } from '@/api/images';
import { useInfiniteItems } from '@/api/queries';
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
import { SORT_ADDED, SORT_TITLE, type SortDef } from './config';
import { DropdownButton, Toolbar, ViewToggle } from './toolbar';

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
