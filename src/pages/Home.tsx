import clsx from 'clsx';
import { useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Home as HomeIcon, SlidersHorizontal } from 'lucide-react';
import { useLatest, useNextUp, useResume, useUserViews } from '@/api/queries';
import type { BaseItemDto } from '@/api/types';
import { FeaturedBanner } from '@/components/media/FeaturedBanner';
import { Hub } from '@/components/media/Hub';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { PageSpinner } from '@/components/ui/Spinner';
import { arrangeRows, DEFAULT_HOME_LAYOUT, moveRow, moveRowTo, useHomeLayout } from '@/lib/homeLayout';
import { usePageTitle } from '@/lib/usePageTitle';
import { t } from '@/i18n';

const LATEST_EXCLUDED = new Set(['livetv', 'playlists', 'boxsets', 'folders']);

function LatestHub({ view }: { view: BaseItemDto }) {
  const { data, isLoading } = useLatest(view.Id, { limit: 24 });
  const shape =
    view.CollectionType === 'music'
      ? 'square'
      : view.CollectionType === 'homevideos' || view.CollectionType === 'photos'
        ? 'landscape'
        : 'poster';
  return (
    <Hub title={t('home.recentlyAddedIn', { name: view.Name })} to={`/library/${view.Id}`} items={data} loading={isLoading} shape={shape} />
  );
}

/** Dialog to reorder and hide the home page's rows. */
function CustomizeHome({ rows, onClose }: { rows: { id: string; label: string; hidden: boolean }[]; onClose: () => void }) {
  const [layout, setLayout] = useHomeLayout();
  const ids = rows.map((r) => r.id);
  const changed = layout.order.length > 0 || layout.hidden.length > 0 || !layout.banner;
  const listRef = useRef<HTMLUListElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  // While a row is dragged by its handle it takes the place of whichever row the pointer is over:
  // its new position is the number of other rows whose middle lies above the pointer.
  const dragTo = (id: string, y: number) => {
    const others = [...(listRef.current?.children ?? [])].filter((el) => (el as HTMLElement).dataset.row !== id);
    const index = others.filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top + rect.height / 2 < y;
    }).length;
    const next = moveRowTo(ids, id, index);
    if (next !== ids) setLayout({ order: next });
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t('home.customiseHome')}
      size="sm"
      footer={
        <>
          {changed && (
            <Button variant="ghost" onClick={() => setLayout(DEFAULT_HOME_LAYOUT)}>
              {t('common.reset')}
            </Button>
          )}
          <Button variant="primary" onClick={onClose}>
            {t('home.done')}
          </Button>
        </>
      }
    >
      <Switch
        label={t('home.featuredTitle')}
        description={t('home.aLargeBannerWithA')}
        checked={layout.banner}
        onChange={(banner) => setLayout({ banner })}
      />
      <div className="mt-3 border-t border-white/10 pt-3 text-[11px] font-semibold tracking-wider text-faint uppercase">
        {t('home.rows')}
      </div>
      <ul className="mt-1" ref={listRef}>
        {rows.map((row, i) => (
          <li
            key={row.id}
            data-row={row.id}
            data-testid="home-row-setting"
            className={clsx('flex items-center gap-1 rounded-md', dragging === row.id && 'bg-white/10')}
          >
            <span
              // Keyboard users have the arrow buttons; the handle is for mouse and touch.
              aria-hidden
              title={t('home.dragToReorder')}
              data-testid="home-row-handle"
              className={clsx('-ml-1 touch-none p-1.5 text-faint hover:text-fg', dragging === row.id ? 'cursor-grabbing' : 'cursor-grab')}
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                setDragging(row.id);
              }}
              onPointerMove={(e) => dragging === row.id && dragTo(row.id, e.clientY)}
              onPointerUp={() => setDragging(null)}
              onPointerCancel={() => setDragging(null)}
            >
              <GripVertical size={16} />
            </span>
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
              aria-label={t('home.moveUp', { label: row.label })}
              className="rounded-full p-1.5 text-muted hover:bg-white/10 hover:text-fg disabled:opacity-25"
            >
              <ArrowUp size={16} />
            </button>
            <button
              onClick={() => setLayout({ order: moveRow(ids, row.id, 1) })}
              disabled={i === rows.length - 1}
              aria-label={t('home.moveDown', { label: row.label })}
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
  usePageTitle(t('common.home'));
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
      <EmptyState icon={<HomeIcon size={48} strokeWidth={1.25} />} title={t('home.noLibrariesYet')}>
        {t('home.yourAccountDoesnTHave')}
      </EmptyState>
    );
  }

  const latest = libraries.filter((v) => !LATEST_EXCLUDED.has(v.CollectionType ?? ''));
  const labels = new Map<string, string>([
    ['continue', t('home.continueWatching')],
    ['listening', t('home.continueListening')],
    ...latest.map((v) => [`latest:${v.Id}`, t('home.recentlyAddedIn', { name: v.Name })] as [string, string]),
  ]);
  const rows = arrangeRows([...labels.keys()], layout);

  const render = (id: string) => {
    if (id === 'continue') {
      return (
        <Hub
          key={id}
          title={t('home.continueWatching')}
          items={continueWatching}
          loading={resume.isLoading || nextUp.isLoading}
          shape="landscape"
        />
      );
    }
    if (id === 'listening') return <Hub key={id} title={t('home.continueListening')} items={resumeAudio.data?.Items} shape="square" />;
    const view = latest.find((v) => `latest:${v.Id}` === id);
    return view ? <LatestHub key={id} view={view} /> : null;
  };

  return (
    <div className="space-y-9 py-6 sm:py-8">
      {layout.banner && <FeaturedBanner />}
      {rows.filter((r) => !r.hidden).map((r) => render(r.id))}
      <div className="flex justify-center pt-2">
        <Button variant="ghost" size="sm" icon={<SlidersHorizontal size={15} />} onClick={() => setCustomizing(true)}>
          {t('home.customiseHome')}
        </Button>
      </div>
      {customizing && (
        <CustomizeHome rows={rows.map((r) => ({ ...r, label: labels.get(r.id) ?? r.id }))} onClose={() => setCustomizing(false)} />
      )}
    </div>
  );
}
