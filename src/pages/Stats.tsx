import { useQuery } from '@tanstack/react-query';
import { Clapperboard, Clock, Music, Tv } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MEDIA } from '@/api/queries';
import type { ItemsResult } from '@/api/types';
import { useApi, useSession } from '@/auth/AuthProvider';
import { PageSpinner } from '@/components/ui/Spinner';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { formatDate, formatDuration, formatNumber } from '@/lib/format';
import { usePageTitle } from '@/lib/usePageTitle';
import { watchStats, type WatchStats } from '@/lib/watchStats';
import { t } from '@/i18n';

/** What the signed-in user has watched and played, worked out from their play state. */
function useWatchStats() {
  const api = useApi();
  const { userId } = useSession();
  return useQuery({
    queryKey: [MEDIA, 'watch-stats', userId],
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }): Promise<WatchStats> => {
      const played = (types: string, fields: string) =>
        api.get<ItemsResult>(
          '/Items',
          {
            userId,
            recursive: true,
            filters: 'IsPlayed',
            includeItemTypes: types,
            fields,
            enableImages: false,
            enableTotalRecordCount: false,
          },
          signal,
        );
      const [watched, songs] = await Promise.all([played('Movie,Episode', 'Genres'), played('Audio', '')]);
      const seriesIds = [...new Set(watched.Items.map((i) => i.SeriesId).filter((id): id is string => Boolean(id)))];
      const series = seriesIds.length
        ? await api.get<ItemsResult>('/Items', { userId, ids: seriesIds.join(','), fields: 'Genres', enableImages: false }, signal)
        : { Items: [] };
      const genres = new Map(series.Items.map((s) => [s.Id, s.Genres ?? []]));
      return watchStats(watched.Items, genres, songs.Items);
    },
  });
}

function Tile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-base-800/70 p-4 ring-1 ring-white/5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">{icon}</div>
      <div className="min-w-0">
        <div className="truncate text-xl font-bold tabular-nums">{value}</div>
        <div className="truncate text-xs text-muted">{label}</div>
      </div>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg bg-base-800/70 p-5 ring-1 ring-white/5">
      <h2 className="font-semibold">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Genres as bars along one scale, each with its name and time written out. */
function GenreBars({ genres }: { genres: WatchStats['genres'] }) {
  const top = genres.slice(0, 8);
  const max = top[0]?.seconds || 1;
  return (
    <ol className="space-y-2.5">
      {top.map((g) => (
        <li key={g.name}>
          <div className="flex justify-between gap-3 text-sm">
            <span className="truncate">{g.name}</span>
            <span className="shrink-0 text-muted tabular-nums">{formatDuration(g.seconds)}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-white/5">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (g.seconds / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** One bar a week; the count shows on hover and focus, and the list is there for screen readers. */
function WeekBars({ weeks }: { weeks: WatchStats['weeks'] }) {
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const label = (w: WatchStats['weeks'][number]) =>
    t('stats.weekOf', { date: formatDate(w.start.toISOString(), { day: 'numeric', month: 'short' }), count: w.count });
  return (
    <div>
      <div className="flex h-32 items-end gap-1 border-b border-white/10" role="list">
        {weeks.map((w) => (
          <div
            key={w.start.getTime()}
            role="listitem"
            tabIndex={0}
            aria-label={label(w)}
            title={label(w)}
            className="group relative flex h-full flex-1 items-end outline-none"
          >
            <div
              className="w-full rounded-t bg-accent transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80"
              style={{ height: w.count ? `${Math.max(4, (w.count / max) * 100)}%` : '0' }}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 rounded bg-base-950 px-1.5 py-0.5 text-xs whitespace-nowrap text-fg shadow group-hover:block group-focus-visible:block">
              {label(w)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>{formatDate(weeks[0].start.toISOString(), { day: 'numeric', month: 'short' })}</span>
        <span>{t('stats.thisWeek')}</span>
      </div>
    </div>
  );
}

export default function StatsPage() {
  usePageTitle(t('stats.title'));
  const { data: stats, isLoading, error, refetch } = useWatchStats();

  if (isLoading) return <PageSpinner />;
  if (error || !stats) return <ErrorState error={error} onRetry={() => refetch()} />;

  const empty = stats.films + stats.episodes + stats.songPlays === 0;
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-8 lg:px-10">
      <div>
        <h1 className="text-2xl font-bold">{t('stats.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('stats.howCounted')}</p>
      </div>
      {empty ? (
        <EmptyState title={t('stats.nothingYet')}>{t('stats.nothingYetHint')}</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile icon={<Clock size={18} />} label={t('stats.timeWatched')} value={formatDuration(stats.seconds) || '0'} />
            <Tile icon={<Clapperboard size={18} />} label={t('stats.films')} value={formatNumber(stats.films)} />
            <Tile icon={<Tv size={18} />} label={t('stats.episodesOfShows', { count: stats.shows })} value={formatNumber(stats.episodes)} />
            <Tile icon={<Music size={18} />} label={t('stats.songPlays')} value={formatNumber(stats.songPlays)} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title={t('stats.lastWeeks', { count: stats.weeks.length })} note={t('stats.lastWeeksNote')}>
              <WeekBars weeks={stats.weeks} />
            </Section>
            {stats.genres.length > 0 && (
              <Section title={t('stats.topGenres')}>
                <GenreBars genres={stats.genres} />
              </Section>
            )}
            {stats.rewatched.length > 0 && (
              <Section title={t('stats.rewatched')}>
                <ol className="space-y-1.5">
                  {stats.rewatched.slice(0, 8).map(({ item, plays }) => (
                    <li key={item.Id} className="flex justify-between gap-3 text-sm">
                      <Link to={`/item/${item.Id}`} className="truncate hover:underline">
                        {item.Name}
                      </Link>
                      <span className="shrink-0 text-muted tabular-nums">{t('stats.times', { count: plays })}</span>
                    </li>
                  ))}
                </ol>
              </Section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
