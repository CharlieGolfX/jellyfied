import { useState } from 'react';
import { t } from '@/i18n';
import { Card } from '@/components/ui/Card';
import { Field, Select, Switch } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { usePrefsSyncEnabled } from '@/lib/prefsSync';
import { useTimeFormat, type TimeFormat } from '@/lib/timeFormat';
import { MAX_BITRATE } from '@/player/deviceProfile';
import { SEEK_STEP_OPTIONS, useSeekSteps } from '@/player/seekSteps';

/** Preferences kept in this browser: streaming quality, clock, skip steps, and whether they follow the account. */
export function DeviceCard() {
  const toast = useToast();
  const [timeFormat, setTimeFormat] = useTimeFormat();
  const [bitrate, setBitrate] = useState(() => Number(localStorage.getItem('jellyfied.maxBitrate')) || MAX_BITRATE);
  const [seekSteps, setSeekSteps] = useSeekSteps();
  const [syncPrefs, setSyncPrefs] = usePrefsSyncEnabled();

  return (
    <Card title={t('common.thisDevice')} description={t('settings.qualityHint')}>
      <div className="mb-3 border-b border-white/5 pb-2">
        <Switch label={t('settings.syncMyPreferences')} description={t('settings.syncHint')} checked={syncPrefs} onChange={setSyncPrefs} />
      </div>
      <Field label={t('settings.defaultStreamingQuality')} hint={t('settings.lowerValuesMakeTheServer')}>
        <Select
          value={bitrate}
          onChange={(e) => {
            const v = Number(e.target.value);
            setBitrate(v);
            try {
              localStorage.setItem('jellyfied.maxBitrate', String(v));
            } catch {
              /* ignore */
            }
            toast.success(t('settings.streamingQualityUpdated'));
          }}
        >
          <option value={MAX_BITRATE}>{t('settings.originalAuto')}</option>
          <option value={40_000_000}>{t('settings.quality40Mbps')}</option>
          <option value={20_000_000}>{t('settings.quality20Mbps')}</option>
          <option value={12_000_000}>{t('settings.quality12Mbps')}</option>
          <option value={8_000_000}>{t('settings.quality8Mbps')}</option>
          <option value={4_000_000}>{t('settings.quality4Mbps')}</option>
          <option value={2_000_000}>{t('settings.quality2Mbps')}</option>
          <option value={1_000_000}>{t('settings.quality1Mbps')}</option>
        </Select>
      </Field>
      <Field className="mt-4" label={t('settings.defaultTimeDisplay')} hint={t('settings.usedForClockTimesSuch')}>
        <Select
          value={timeFormat}
          onChange={(e) => {
            setTimeFormat(e.target.value as TimeFormat);
            toast.success(t('settings.timeDisplayUpdated'));
          }}
        >
          <option value="24h">{t('settings.clock24Hour')}</option>
          <option value="12h">{t('settings.clock12Hour')}</option>
        </Select>
      </Field>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label={t('settings.skipBack')} hint={t('settings.backHint')}>
          <Select value={seekSteps.back} onChange={(e) => setSeekSteps({ back: Number(e.target.value) })}>
            {SEEK_STEP_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {t('settings.seconds', { count: s })}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('settings.skipForward')} hint={t('settings.forwardHint')}>
          <Select value={seekSteps.forward} onChange={(e) => setSeekSteps({ forward: Number(e.target.value) })}>
            {SEEK_STEP_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {t('settings.seconds', { count: s })}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Card>
  );
}
