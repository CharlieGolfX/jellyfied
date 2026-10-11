import clsx from 'clsx';
import { lazy, Suspense, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useItem } from '@/api/queries';
import { LibraryIcon } from '@/components/layout/libraryIcon';
import { PageSpinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { usePageTitle } from '@/lib/usePageTitle';
import { configFor, SORT_ADDED, SORT_TITLE, type TabId } from './library/config';
import { FolderGrid } from './library/FolderGrid';
import { ArtistsGrid, GenreGrid } from './library/GenreGrid';
import { LibraryGrid } from './library/LibraryGrid';
import { Recommended } from './library/Recommended';

const LiveTvPage = lazy(() => import('./LiveTv'));

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
      <div data-library-header className="sticky top-0 z-20 border-b border-white/5 bg-base-900/90 backdrop-blur-md">
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
