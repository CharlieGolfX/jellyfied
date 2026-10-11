import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Home as HomeIcon, SlidersHorizontal } from 'lucide-react';
import { useLatest, useNextUp, useResume, useUserViews } from '@/api/queries';
import type { BaseItemDto } from '@/api/types';
import { FeaturedBanner } from '@/components/media/FeaturedBanner';
import { Hub } from '@/components/media/Hub';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { PageSpinner } from '@/components/ui/Spinner';
import { arrangeRows, DEFAULT_HOME_LAYOUT, moveRow, useHomeLayout } from '@/lib/homeLayout';
import { usePageTitle } from '@/lib/usePageTitle';

const LATEST_EXCLUDED = new Set(['livetv', 'playlists', 'boxsets', 'folders']);

function LatestHub({ view }: { view: BaseItemDto }) {
  const { data, isLoading } = useLatest(view.Id, { limit: 24 });
  const shape =
    view.CollectionType === 'music'
      ? 'square'
      : view.CollectionType === 'homevideos' || view.CollectionType === 'photos'
        ? 'landscape'
        : 'poster';
  return <Hub title={`Recently Added in ${view.Name}`} to={`/library/${view.Id}`} items={data} loading={isLoading} shape={shape} />;
}

/** Dialog to reorder and hide the home page's rows. */
function CustomizeHome({ rows, onClose }: { rows: { id: string; label: string; hidden: boolean }[]; onClose: () => void }) {
  const [layout, setLayout] = useHomeLayout();
  const ids = rows.map((r) => r.id);
  const changed = layout.order.length > 0 || layout.hidden.length > 0 || !layout.banner;
  return (
    <Modal
      open
      onClose={onClose}
      title="Customise home"
      size="sm"
      footer={
        <>
          {changed && (
            <Button variant="ghost" onClick={() => setLayout(DEFAULT_HOME_LAYOUT)}>
              Reset
            </Button>
          )}
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <Switch
        label="Featured title"
        description="A large banner with a recently added film or show at the top."
        checked={layout.banner}
        onChange={(banner) => setLayout({ banner })}
      />
      <div className="mt-3 border-t border-white/10 pt-3 text-[11px] font-semibold tracking-wider text-faint uppercase">Rows</div>
      <ul className="mt-1">
        {rows.map((row, i) => (
          <li key={row.id} className="flex items-center gap-1" data-testid="home-row-setting">
            <div className="min-w-0 flex-1">
              <Switch
                label={<span className="block truncate">{row.label}</span>}
                checked={!row.hidden}
                onChange={(shown) => setLayout({ hidden: shown ? layout.hidden.filter((h) => h !== row.id) : [...layout.hidden, row.id] })}
              />
            </div>
            <button
              onClick={() => setLayout({ order: moveRow(ids, row.id, -1) })}
              disabled={i === 0}
              aria-label={`Move ${row.label} up`}
              className="rounded-full p-1.5 text-muted hover:bg-white/10 hover:text-fg disabled:opacity-25"
            >
              <ArrowUp size={16} />
            </button>
            <button
              onClick={() => setLayout({ order: moveRow(ids, row.id, 1) })}
              disabled={i === rows.length - 1}
              aria-label={`Move ${row.label} down`}
              className="rounded-full p-1.5 text-muted hover:bg-white/10 hover:text-fg disabled:opacity-25"
            >
              <ArrowDown size={16} />
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export default function HomePage() {
  usePageTitle('Home');
  const views = useUserViews();
  const resume = useResume();
  const nextUp = useNextUp({ limit: 24 });
  const resumeAudio = useResume(undefined, ['Audio']);
  const [layout] = useHomeLayout();
  const [customizing, setCustomizing] = useState(false);

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

  const latest = libraries.filter((v) => !LATEST_EXCLUDED.has(v.CollectionType ?? ''));
  const labels = new Map<string, string>([
    ['continue', 'Continue Watching'],
    ['listening', 'Continue Listening'],
    ...latest.map((v) => [`latest:${v.Id}`, `Recently Added in ${v.Name}`] as [string, string]),
  ]);
  const rows = arrangeRows([...labels.keys()], layout);

  const render = (id: string) => {
    if (id === 'continue') {
      return (
        <Hub key={id} title="Continue Watching" items={continueWatching} loading={resume.isLoading || nextUp.isLoading} shape="landscape" />
      );
    }
    if (id === 'listening') return <Hub key={id} title="Continue Listening" items={resumeAudio.data?.Items} shape="square" />;
    const view = latest.find((v) => `latest:${v.Id}` === id);
    return view ? <LatestHub key={id} view={view} /> : null;
  };

  return (
    <div className="space-y-9 py-6 sm:py-8">
      {layout.banner && <FeaturedBanner />}
      {rows.filter((r) => !r.hidden).map((r) => render(r.id))}
      <div className="flex justify-center pt-2">
        <Button variant="ghost" size="sm" icon={<SlidersHorizontal size={15} />} onClick={() => setCustomizing(true)}>
          Customise home
        </Button>
      </div>
      {customizing && (
        <CustomizeHome rows={rows.map((r) => ({ ...r, label: labels.get(r.id) ?? r.id }))} onClose={() => setCustomizing(false)} />
      )}
    </div>
  );
}
