import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clapperboard, Clock, Music, Trophy, Tv, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MEDIA } from '@/api/queries';
import { useApi, useSession } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { PageSpinner, Spinner } from '@/components/ui/Spinner';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatDuration, formatNumber } from '@/lib/format';
import {
  comparing,
  getComparison,
  loadStatsSource,
  setComparing,
  shareSummaries,
  type Statement,
  type StatsSource,
} from '@/lib/statsCompare';
import { usePageTitle } from '@/lib/usePageTitle';
import { RANGES, watchStats, type Bucket, type Range, type WatchStats } from '@/lib/watchStats';
import { usePickerSupported } from '@/player/syncplayPickerApi';
import { t } from '@/i18n';

/** What the signed-in user has actually played, from the playtime Jellyfied measures. */
function useStatsSource() {
  const api = useApi();
  const { userId } = useSession();
  return useQuery({
    queryKey: [MEDIA, 'watch-stats', userId],
    staleTime: 60_000,
    queryFn: ({ signal }) => loadStatsSource(api, userId, signal),
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

const bucketLabel = (b: Bucket, unit: WatchStats['bucket']) =>
  unit === 'month'
    ? formatDate(b.start.toISOString(), { month: 'long', year: 'numeric' })
    : unit === 'week'
      ? t('stats.weekOf', { date: formatDate(b.start.toISOString(), { day: 'numeric', month: 'short' }) })
      : formatDate(b.start.toISOString(), { weekday: 'short', day: 'numeric', month: 'short' });

/** One bar a day, week or month; the time shows on hover and focus, and the list is there for screen readers. */
function Bars({ buckets, unit }: { buckets: Bucket[]; unit: WatchStats['bucket'] }) {
  const max = Math.max(1, ...buckets.map((b) => b.seconds));
  const label = (b: Bucket) => `${bucketLabel(b, unit)}: ${formatDuration(b.seconds) || '0'}`;
  return (
    <div>
      <div className={clsx('flex h-32 items-end border-b border-white/10', buckets.length > 20 ? 'gap-px' : 'gap-1')} role="list">
        {buckets.map((b) => (
          <div
            key={b.start.getTime()}
            role="listitem"
            tabIndex={0}
            aria-label={label(b)}
            title={label(b)}
            className="group relative flex h-full flex-1 items-end outline-none"
          >
            <div
              className="w-full rounded-t bg-accent transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80"
              style={{ height: b.seconds ? `${Math.max(4, (b.seconds / max) * 100)}%` : '0' }}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded bg-base-950 px-1.5 py-0.5 text-xs whitespace-nowrap text-fg shadow group-hover:block group-focus-visible:block">
              {label(b)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>{bucketLabel(buckets[0], unit)}</span>
        <span>{t(`stats.this.${unit}`)}</span>
      </div>
    </div>
  );
}

/** A comparison as a sentence about the reader. */
function sentence(s: Statement): string {
  if (s.type === 'mostGenre') return t('stats.compare.mostGenre', { genre: s.genre });
  if (s.type === 'most') return t(`stats.compare.most.${s.metric}`);
  return t(`stats.compare.more.${s.metric}`, { share: s.share });
}

/** How the reader compares with the others who take part, or the choice to take part. */
function Comparison({ range, source }: { range: Range; source: StatsSource }) {
  const api = useApi();
  const { userId } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const joined = useQuery({ queryKey: ['stats-compare', 'joined', userId], queryFn: () => comparing(api, userId), staleTime: Infinity });
  const result = useQuery({
    queryKey: ['stats-compare', 'result', userId, range],
    enabled: joined.data === true,
    queryFn: async () => {
      // Fresh numbers in first (only while still taking part), then what they say.
      if (qc.getQueryData(['stats-compare', 'joined', userId]) === true) await shareSummaries(api, userId, source);
      return getComparison(api, range);
    },
    staleTime: 5 * 60_000,
  });
  const toggle = useMutation({
    mutationFn: (on: boolean) => setComparing(api, userId, on, source),
    onSuccess: (_, on) => {
      qc.setQueryData(['stats-compare', 'joined', userId], on);
      // Not refreshed when stopping: refreshing sends the summary again, which would take part again.
      if (on) void qc.invalidateQueries({ queryKey: ['stats-compare', 'result'] });
      else qc.removeQueries({ queryKey: ['stats-compare', 'result'] });
      toast.success(on ? t('stats.compare.joinedToast') : t('stats.compare.leftToast'));
    },
    onError: (e) => toast.error(e),
  });

  const stop = (
    <button
      className="text-xs text-muted underline-offset-2 hover:text-fg hover:underline"
      onClick={() => toggle.mutate(false)}
      disabled={toggle.isPending}
    >
      {t('stats.compare.stop')}
    </button>
  );

  let body: ReactNode;
  if (joined.isLoading || (joined.data && result.isLoading)) {
    body = (
      <div className="flex justify-center py-4 text-accent">
        <Spinner size={20} />
      </div>
    );
  } else if (!joined.data) {
    body = (
      <div className="space-y-3">
        <p className="text-sm text-muted">{t('stats.compare.explain')}</p>
        <Button variant="primary" icon={<Users size={16} />} onClick={() => toggle.mutate(true)} loading={toggle.isPending}>
          {t('stats.compare.join')}
        </Button>
      </div>
    );
  } else if (result.error || !result.data) {
    body = <p className="text-sm text-muted">{t('stats.compare.unavailable')}</p>;
  } else if (!result.data.enough) {
    body = (
      <div className="space-y-2">
        <p className="text-sm text-muted">
          {t('stats.compare.notEnough', { count: result.data.minUsers, taking: result.data.participants })}
        </p>
        {stop}
      </div>
    );
  } else {
    const statements = result.data.statements ?? [];
    body = (
      <div className="space-y-3">
        {statements.length ? (
          <ul className="space-y-2" data-testid="comparisons">
            {statements.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <Trophy size={16} className="mt-0.5 shrink-0 text-star" />
                {sentence(s)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t('stats.compare.nothingStandsOut')}</p>
        )}
        <p className="text-xs text-faint">{t('stats.compare.among', { count: result.data.participants })}</p>
        {stop}
      </div>
    );
  }
  return (
    <Section title={t('stats.compare.title')} note={t('stats.compare.anonymous')}>
      {body}
    </Section>
  );
}

export default function StatsPage() {
  usePageTitle(t('stats.title'));
  const [params, setParams] = useSearchParams();
  const range: Range = (RANGES as readonly string[]).includes(params.get('range') ?? '') ? (params.get('range') as Range) : '30d';
  const { data: source, isLoading, error, refetch } = useStatsSource();
  const canCompare = usePickerSupported();

  if (isLoading) return <PageSpinner />;
  if (error || !source) return <ErrorState error={error} onRetry={() => refetch()} />;
  const stats = watchStats(source.playtime, source.items, source.seriesGenres, range);
  const nothingAtAll = !Object.keys(source.playtime.days).length;
  const empty = stats.seconds + stats.musicSeconds < 1;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-8 lg:px-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-80">
          <h1 className="text-2xl font-bold">{t('stats.title')}</h1>
          <p className="mt-1 text-sm text-muted">
            {t('stats.howCounted')}
            {stats.since && ` ${t('stats.since', { date: formatDate(stats.since.toISOString(), { dateStyle: 'long' }) })}`}
          </p>
        </div>
        <div
          className="grid w-full grid-cols-5 gap-1 rounded-lg bg-base-800/70 p-1 ring-1 ring-white/5 sm:flex sm:w-auto sm:shrink-0"
          role="radiogroup"
          aria-label={t('stats.period')}
        >
          {RANGES.map((r) => (
            <button
              key={r}
              role="radio"
              aria-checked={r === range}
              onClick={() => setParams({ range: r }, { replace: true })}
              className={clsx(
                'rounded-md px-1 py-1.5 text-xs whitespace-nowrap transition-colors sm:px-2.5 sm:text-sm',
                r === range ? 'bg-accent-fill font-medium text-accent-ink' : 'text-muted hover:bg-white/10 hover:text-fg',
              )}
            >
              {t(`stats.ranges.${r}`)}
            </button>
          ))}
        </div>
      </div>
      {nothingAtAll ? (
        <EmptyState title={t('stats.nothingYet')}>{t('stats.nothingYetHint')}</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile icon={<Clock size={18} />} label={t('stats.timeWatched')} value={formatDuration(stats.seconds) || '0'} />
            <Tile icon={<Clapperboard size={18} />} label={t('stats.films')} value={formatNumber(stats.films)} />
            <Tile icon={<Tv size={18} />} label={t('stats.episodesOfShows', { count: stats.shows })} value={formatNumber(stats.episodes)} />
            <Tile
              icon={<Music size={18} />}
              label={t('stats.musicListened', { count: stats.songPlays })}
              value={formatDuration(stats.musicSeconds) || '0'}
            />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title={t('stats.timePlayed')} note={t(`stats.per.${stats.bucket}`)}>
              {empty ? (
                <p className="py-10 text-center text-sm text-muted">{t('stats.nothingInPeriod')}</p>
              ) : (
                <Bars buckets={stats.buckets} unit={stats.bucket} />
              )}
            </Section>
            {canCompare && <Comparison range={range} source={source} />}
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
