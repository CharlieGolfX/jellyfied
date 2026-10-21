import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Circle, Tv } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MEDIA } from '@/api/queries';
import type { BaseItemDto, ItemsResult } from '@/api/types';
import { useApi, useSession } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { formatDate } from '@/lib/format';
import { formatTimeOfDay, useTimeFormat } from '@/lib/timeFormat';
import { halfHours, HOUR_PX, offsetOf, placePrograms, STEP_HOURS, WINDOW_HOURS, windowStart } from './guideLayout';
import { ProgramDialog } from './ProgramDialog';
import { useNow } from './shared';
import { t } from '@/i18n';

const HOUR = 3_600_000;
const ROW = 'h-16';
const CHANNEL_COLUMN = 'w-28 sm:w-44';

/** The programme guide: a row per channel, time running to the right, a few hours at a time. */
export function Guide({ channels }: { channels: BaseItemDto[] }) {
  const api = useApi();
  const { userId } = useSession();
  const now = useNow();
  const [format] = useTimeFormat();
  /** Hours away from now, in steps of STEP_HOURS. */
  const [shift, setShift] = useState(0);
  const [open, setOpen] = useState<BaseItemDto | null>(null);
  const start = windowStart(now) + shift * HOUR;
  const end = start + WINDOW_HOURS * HOUR;

  const programs = useQuery({
    queryKey: [MEDIA, 'livetv', 'guide', userId, start],
    queryFn: ({ signal }) =>
      api.get<ItemsResult>(
        '/LiveTv/Programs',
        {
          userId,
          minEndDate: new Date(start).toISOString(),
          maxStartDate: new Date(end).toISOString(),
          sortBy: 'StartDate',
          enableImages: false,
          enableUserData: false,
          enableTotalRecordCount: false,
        },
        signal,
      ),
    placeholderData: (previous) => previous,
    refetchInterval: 5 * 60_000,
  });

  const byChannel = useMemo(() => {
    const map = new Map<string, BaseItemDto[]>();
    for (const p of programs.data?.Items ?? []) {
      if (!p.ChannelId) continue;
      map.set(p.ChannelId, [...(map.get(p.ChannelId) ?? []), p]);
    }
    return map;
  }, [programs.data]);

  if (programs.isLoading) return <PageSpinner />;
  if (programs.error) return <ErrorState error={programs.error} onRetry={() => programs.refetch()} />;
  if (channels.length === 0) {
    return (
      <EmptyState icon={<Tv size={48} strokeWidth={1.25} />} title={t('liveTv.noChannels')}>
        {t('liveTv.liveTvHasNoChannels')}
      </EmptyState>
    );
  }

  const width = WINDOW_HOURS * HOUR_PX;
  const nowLine = now >= start && now < end ? offsetOf(now, start) : null;

  return (
    <div className="px-2 pt-4 [--guide-channels:7rem] sm:px-6 sm:[--guide-channels:11rem] lg:px-8" data-testid="livetv-guide">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" icon={<ChevronLeft size={14} />} onClick={() => setShift(shift - STEP_HOURS)}>
          {t('liveTv.earlier')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShift(0)} disabled={shift === 0}>
          {t('liveTv.now')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShift(shift + STEP_HOURS)}>
          {t('liveTv.later')} <ChevronRight size={14} />
        </Button>
        <span className="ml-2 text-sm text-muted">
          {formatDate(new Date(start).toISOString(), { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>

      <div className="overflow-x-auto rounded-md ring-1 ring-white/5">
        <div className="relative" style={{ width: `calc(${width}px + var(--guide-channels))` }} role="grid" aria-label={t('liveTv.guide')}>
          {/* Times along the top. */}
          <div className="sticky top-0 z-10 flex border-b border-white/10 bg-base-850" role="row">
            <div className={clsx(CHANNEL_COLUMN, 'sticky left-0 z-10 shrink-0 bg-base-850')} />
            {halfHours(start).map((time) => (
              <div
                key={time}
                className="shrink-0 border-l border-white/5 px-2 py-1.5 text-xs text-muted tabular-nums"
                style={{ width: HOUR_PX / 2 }}
                role="columnheader"
              >
                {formatTimeOfDay(new Date(time), format)}
              </div>
            ))}
          </div>

          {channels.map((channel) => (
            <div key={channel.Id} className="flex border-b border-white/5" role="row">
              <div
                className={clsx(CHANNEL_COLUMN, ROW, 'sticky left-0 z-10 flex shrink-0 items-center gap-2 bg-base-900 px-2')}
                role="rowheader"
              >
                <span className="w-7 shrink-0 text-right text-xs text-muted tabular-nums">{channel.ChannelNumber}</span>
                <span className="truncate text-sm font-medium">{channel.Name}</span>
              </div>
              <div className={clsx(ROW, 'relative shrink-0')} style={{ width }}>
                {placePrograms(byChannel.get(channel.Id) ?? [], start).map(({ program, left, width: w, cutStart }) => {
                  const from = Date.parse(program.StartDate!);
                  const to = Date.parse(program.EndDate!);
                  const airing = from <= now && now < to;
                  return (
                    <button
                      key={program.Id}
                      role="gridcell"
                      onClick={() => setOpen(program)}
                      className={clsx(
                        'absolute inset-y-1 overflow-hidden rounded px-2 text-left transition-colors',
                        airing
                          ? 'bg-accent/15 hover:bg-accent/25'
                          : to <= now
                            ? 'bg-white/[0.03] text-muted hover:bg-white/10'
                            : 'bg-white/5 hover:bg-white/10',
                      )}
                      style={{ left: left + 1, width: Math.max(2, w - 2) }}
                      title={program.Name ?? undefined}
                    >
                      <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                        {(program.TimerId || program.SeriesTimerId) && (
                          <Circle size={8} className="shrink-0 text-danger" fill="currentColor" aria-label={t('liveTv.willBeRecorded')} />
                        )}
                        {cutStart && '‹ '}
                        {program.Name}
                      </span>
                      <span className="block truncate text-xs text-muted tabular-nums">
                        {formatTimeOfDay(new Date(from), format)} – {formatTimeOfDay(new Date(to), format)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {nowLine !== null && (
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-[5] w-0.5 bg-accent"
              style={{ left: `calc(${nowLine}px + var(--guide-channels))` }}
              aria-hidden
            />
          )}
        </div>
      </div>
      {open && <ProgramDialog program={open} now={now} onClose={() => setOpen(null)} />}
    </div>
  );
}
