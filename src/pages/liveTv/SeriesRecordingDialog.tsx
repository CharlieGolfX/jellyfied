import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Select, Switch } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useSaveSeriesTimer, useSeriesTimerDraft, type SeriesOptions } from './dvr';
import { t } from '@/i18n';

const PADDING_MINUTES = [0, 1, 2, 5, 10, 15, 30, 60];
const KEEP = [0, 1, 2, 3, 5, 10, 20];

/** Minutes for a padding select: the usual choices, plus what the server has if it is another. */
const paddingChoices = (seconds: number) => [...new Set([...PADDING_MINUTES, Math.round(seconds / 60)])].sort((a, b) => a - b);

function optionsOf(timer: Partial<SeriesOptions>): SeriesOptions {
  return {
    RecordNewOnly: Boolean(timer.RecordNewOnly),
    RecordAnyChannel: Boolean(timer.RecordAnyChannel),
    RecordAnyTime: Boolean(timer.RecordAnyTime),
    PrePaddingSeconds: timer.PrePaddingSeconds ?? 0,
    PostPaddingSeconds: timer.PostPaddingSeconds ?? 0,
    KeepUpTo: timer.KeepUpTo ?? 0,
  };
}

/**
 * Recording every airing of a series: which airings (new ones only, on any channel, at any time),
 * how much before and after each to record, and how many recordings to keep. Opened for a
 * programme to set one up, or for an existing series recording to change it.
 */
export function SeriesRecordingDialog({
  name,
  target,
  onClose,
}: {
  name: string;
  target: { programId: string } | { seriesTimerId: string };
  onClose: () => void;
}) {
  const draft = useSeriesTimerDraft(target);
  const save = useSaveSeriesTimer();
  const toast = useToast();
  const [edited, setEdited] = useState<SeriesOptions | null>(null);
  const editing = 'seriesTimerId' in target;
  const options = edited ?? (draft.data ? optionsOf(draft.data) : null);
  const set = (change: Partial<SeriesOptions>) => options && setEdited({ ...options, ...change });

  const submit = () => {
    if (!draft.data || !options) return;
    save.mutate(
      { id: editing ? target.seriesTimerId : undefined, timer: { ...draft.data, ...options } },
      {
        onSuccess: () => {
          toast.success(editing ? t('liveTv.seriesRecordingSaved') : t('liveTv.seriesRecordingScheduled'));
          onClose();
        },
        onError: (e) => toast.error(e),
      },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('liveTv.recordSeriesTitle', { name })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={submit} loading={save.isPending} disabled={!options}>
            {editing ? t('common.save') : t('liveTv.recordSeries')}
          </Button>
        </>
      }
    >
      {draft.isLoading ? (
        <div className="flex justify-center py-8 text-accent">
          <Spinner size={24} />
        </div>
      ) : draft.error || !options ? (
        <ErrorState error={draft.error} onRetry={() => draft.refetch()} />
      ) : (
        <div className="space-y-2" data-testid="series-recording">
          <Switch checked={options.RecordNewOnly} onChange={(v) => set({ RecordNewOnly: v })} label={t('liveTv.newEpisodesOnly')} />
          <Switch checked={options.RecordAnyChannel} onChange={(v) => set({ RecordAnyChannel: v })} label={t('liveTv.onAnyChannel')} />
          <Switch checked={options.RecordAnyTime} onChange={(v) => set({ RecordAnyTime: v })} label={t('liveTv.atAnyTime')} />
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Field label={t('liveTv.startEarly')}>
              <Select
                value={Math.round(options.PrePaddingSeconds / 60)}
                onChange={(e) => set({ PrePaddingSeconds: Number(e.target.value) * 60 })}
              >
                {paddingChoices(options.PrePaddingSeconds).map((m) => (
                  <option key={m} value={m}>
                    {t('liveTv.minutes', { count: m })}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('liveTv.endLate')}>
              <Select
                value={Math.round(options.PostPaddingSeconds / 60)}
                onChange={(e) => set({ PostPaddingSeconds: Number(e.target.value) * 60 })}
              >
                {paddingChoices(options.PostPaddingSeconds).map((m) => (
                  <option key={m} value={m}>
                    {t('liveTv.minutes', { count: m })}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={t('liveTv.keep')} className="pt-1">
            <Select value={options.KeepUpTo} onChange={(e) => set({ KeepUpTo: Number(e.target.value) })}>
              {[...new Set([...KEEP, options.KeepUpTo])]
                .sort((a, b) => a - b)
                .map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? t('liveTv.keepAll') : t('liveTv.keepLatest', { count: n })}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
      )}
    </Modal>
  );
}
