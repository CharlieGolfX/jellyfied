import { Circle, CircleOff, Play, Repeat } from 'lucide-react';
import { useState } from 'react';
import type { BaseItemDto } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/format';
import { useCanRecord, useDvr, useProgram, type DvrAction } from './dvr';
import { SeriesRecordingDialog } from './SeriesRecordingDialog';
import { ProgramTimes, usePlayChannel } from './shared';
import { t } from '@/i18n';

/**
 * A programme from the guide: what it is and when, with watching its channel while it airs, and
 * recording it (or every airing of its series) for those allowed to.
 */
export function ProgramDialog({ program: listed, now, onClose }: { program: BaseItemDto; now: number; onClose: () => void }) {
  const full = useProgram(listed.Id);
  const program = full.data ?? listed;
  const playChannel = usePlayChannel();
  const canRecord = useCanRecord();
  const dvr = useDvr();
  const toast = useToast();
  const [seriesOpen, setSeriesOpen] = useState(false);

  const start = Date.parse(program.StartDate ?? '');
  const end = Date.parse(program.EndDate ?? '');
  const airing = start <= now && now < end;
  const over = end <= now;

  const run = (action: DvrAction, done: string) =>
    dvr.mutate(action, { onSuccess: () => toast.success(done), onError: (e) => toast.error(e) });

  const actions = (
    <div className="flex flex-wrap gap-2">
      {airing && program.ChannelId && (
        <Button
          variant="primary"
          icon={<Play size={16} fill="currentColor" />}
          onClick={() => {
            onClose();
            void playChannel(program.ChannelId!, program.ChannelName);
          }}
        >
          {t('liveTv.watchNow')}
        </Button>
      )}
      {canRecord && !over && full.data && (
        <>
          {program.TimerId ? (
            <Button
              variant="outline"
              icon={<CircleOff size={16} />}
              loading={dvr.isPending}
              onClick={() => run({ kind: 'cancel', timerId: program.TimerId! }, t('liveTv.recordingCancelled'))}
            >
              {t('liveTv.cancelRecording')}
            </Button>
          ) : (
            <Button
              variant="outline"
              icon={<Circle size={16} className="text-danger" fill="currentColor" />}
              loading={dvr.isPending}
              onClick={() => run({ kind: 'record', programId: program.Id }, t('liveTv.recordingScheduled'))}
            >
              {t('liveTv.record')}
            </Button>
          )}
          {program.SeriesTimerId ? (
            <Button
              variant="outline"
              icon={<CircleOff size={16} />}
              loading={dvr.isPending}
              onClick={() => run({ kind: 'cancelSeries', seriesTimerId: program.SeriesTimerId! }, t('liveTv.seriesRecordingCancelled'))}
            >
              {t('liveTv.cancelSeriesRecording')}
            </Button>
          ) : (
            program.IsSeries && (
              <Button variant="outline" icon={<Repeat size={16} />} onClick={() => setSeriesOpen(true)}>
                {t('liveTv.recordSeriesMenu')}
              </Button>
            )
          )}
        </>
      )}
    </div>
  );

  return (
    <>
      {seriesOpen && (
        <SeriesRecordingDialog name={program.Name ?? ''} target={{ programId: program.Id }} onClose={() => setSeriesOpen(false)} />
      )}
      <Modal open={!seriesOpen} onClose={onClose} title={program.Name ?? ''} footer={actions}>
        <div className="space-y-3 text-sm" data-testid="program-dialog">
          {program.EpisodeTitle && <p className="font-medium">{program.EpisodeTitle}</p>}
          <p className="text-muted">
            {[program.ChannelName, formatDate(program.StartDate, { weekday: 'long', day: 'numeric', month: 'long' })]
              .filter(Boolean)
              .join(' · ')}
            {' · '}
            <ProgramTimes program={program} />
          </p>
          {(program.TimerId || program.SeriesTimerId) && (
            <p className="flex items-center gap-2 text-danger">
              <Circle size={10} fill="currentColor" />
              {program.SeriesTimerId ? t('liveTv.seriesWillBeRecorded') : t('liveTv.willBeRecorded')}
            </p>
          )}
          {full.isLoading ? (
            <div className="flex justify-center py-4 text-accent">
              <Spinner size={20} />
            </div>
          ) : (
            program.Overview && <p className="leading-relaxed text-muted">{program.Overview}</p>
          )}
        </div>
      </Modal>
    </>
  );
}
