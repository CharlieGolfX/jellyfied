import { CircleOff, Repeat, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/format';
import { formatTimeOfDay, useTimeFormat } from '@/lib/timeFormat';
import { useCanRecord, useDvr, useSeriesTimers, useTimers } from './dvr';
import { SeriesRecordingDialog } from './SeriesRecordingDialog';
import { t } from '@/i18n';

/** What the server is going to record, one programme at a time and series by series, each with a way to call it off. */
export function Scheduled() {
  const timers = useTimers();
  const series = useSeriesTimers();
  const canRecord = useCanRecord();
  const dvr = useDvr();
  const toast = useToast();
  const [format] = useTimeFormat();
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const upcoming = timers.data ?? [];
  const recurring = series.data ?? [];
  if (upcoming.length === 0 && recurring.length === 0) return null;

  const row = 'flex items-center gap-3 rounded-md px-3 py-2 hover:bg-white/5';
  return (
    <>
      {editing && <SeriesRecordingDialog name={editing.name} target={{ seriesTimerId: editing.id }} onClose={() => setEditing(null)} />}
      <div className="grid gap-6 px-4 pt-6 sm:px-8 lg:grid-cols-2 lg:px-10" data-testid="livetv-scheduled">
        {upcoming.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">{t('liveTv.scheduled')}</h2>
            <ul>
              {upcoming.map((timer) => (
                <li key={timer.Id} className={row}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{timer.Name}</span>
                    <span className="block truncate text-xs text-muted">
                      {[timer.ChannelName, formatDate(timer.StartDate, { weekday: 'short', day: 'numeric', month: 'short' })]
                        .filter(Boolean)
                        .join(' · ')}
                      {' · '}
                      <span className="tabular-nums">
                        {formatTimeOfDay(new Date(timer.StartDate), format)} – {formatTimeOfDay(new Date(timer.EndDate), format)}
                      </span>
                      {timer.Status === 'InProgress' && <span className="text-danger"> · {t('liveTv.recordingNow')}</span>}
                    </span>
                  </span>
                  {canRecord && timer.Id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<CircleOff size={14} />}
                      disabled={dvr.isPending}
                      aria-label={t('liveTv.cancelRecordingOf', { name: timer.Name ?? '' })}
                      onClick={() =>
                        dvr.mutate(
                          { kind: 'cancel', timerId: timer.Id! },
                          { onSuccess: () => toast.success(t('liveTv.recordingCancelled')), onError: (e) => toast.error(e) },
                        )
                      }
                    >
                      {t('common.cancel')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        {recurring.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">{t('liveTv.seriesRecordings')}</h2>
            <ul>
              {recurring.map((s) => (
                <li key={s.Id} className={row}>
                  <Repeat size={16} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{s.Name}</span>
                    <span className="block truncate text-xs text-muted">
                      {[
                        s.RecordAnyChannel ? t('liveTv.anyChannel') : s.ChannelName,
                        s.RecordNewOnly ? t('liveTv.newEpisodesOnly') : t('liveTv.allEpisodes'),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  {canRecord && s.Id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Settings2 size={14} />}
                      aria-label={t('liveTv.seriesRecordingSettingsOf', { name: s.Name ?? '' })}
                      onClick={() => setEditing({ id: s.Id!, name: s.Name ?? '' })}
                    >
                      {t('liveTv.settings')}
                    </Button>
                  )}
                  {canRecord && s.Id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<CircleOff size={14} />}
                      disabled={dvr.isPending}
                      aria-label={t('liveTv.cancelSeriesRecordingOf', { name: s.Name ?? '' })}
                      onClick={() =>
                        dvr.mutate(
                          { kind: 'cancelSeries', seriesTimerId: s.Id! },
                          { onSuccess: () => toast.success(t('liveTv.seriesRecordingCancelled')), onError: (e) => toast.error(e) },
                        )
                      }
                    >
                      {t('common.cancel')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
