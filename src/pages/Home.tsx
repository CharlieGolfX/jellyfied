import { useMemo } from 'react';
import { Home as HomeIcon } from 'lucide-react';
import { useLatest, useNextUp, useResume, useUserViews } from '@/api/queries';
import type { BaseItemDto } from '@/api/types';
import { Hub } from '@/components/media/Hub';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { PageSpinner } from '@/components/ui/Spinner';

const LATEST_EXCLUDED = new Set(['livetv', 'playlists', 'boxsets', 'folders']);

function LatestHub({ view }: { view: BaseItemDto }) {
  const { data, isLoading } = useLatest(view.Id, { limit: 24 });
  const shape = view.CollectionType === 'music' ? 'square' : view.CollectionType === 'homevideos' || view.CollectionType === 'photos' ? 'landscape' : 'poster';
  return (
    <Hub
      title={`Recently Added in ${view.Name}`}
      to={`/library/${view.Id}`}
      items={data}
      loading={isLoading}
      shape={shape}
    />
  );
}

export default function HomePage() {
  const views = useUserViews();
  const resume = useResume();
  const nextUp = useNextUp({ limit: 24 });
  const resumeAudio = useResume(undefined, ['Audio']);

  // Plex merges in-progress items with "on deck" episodes into one Continue Watching row.
  const continueWatching = useMemo(() => {
    if (!resume.data && !nextUp.data) return undefined;
    const items = [...(resume.data?.Items ?? [])];
    const seenSeries = new Set(items.filter((i) => i.SeriesId).map((i) => i.SeriesId));
    for (const ep of nextUp.data?.Items ?? []) {
      if (ep.SeriesId && seenSeries.has(ep.SeriesId)) continue;
      seenSeries.add(ep.SeriesId);
      items.push(ep);
    }
    return items;
  }, [resume.data, nextUp.data]);

  if (views.isLoading) return <PageSpinner />;
  if (views.error) return <ErrorState error={views.error} onRetry={() => views.refetch()} />;

  const libraries = views.data?.Items ?? [];
  if (libraries.length === 0) {
    return (
      <EmptyState icon={<HomeIcon size={48} strokeWidth={1.25} />} title="No libraries yet">
        Your account doesn’t have access to any libraries. An administrator can add libraries from the dashboard.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-9 py-6 sm:py-8">
      <Hub
        title="Continue Watching"
        items={continueWatching}
        loading={resume.isLoading || nextUp.isLoading}
        shape="landscape"
      />
      <Hub
        title="Continue Listening"
        items={resumeAudio.data?.Items}
        shape="square"
      />
      {libraries
        .filter((v) => !LATEST_EXCLUDED.has(v.CollectionType ?? ''))
        .map((view) => (
          <LatestHub key={view.Id} view={view} />
        ))}
    </div>
  );
}
