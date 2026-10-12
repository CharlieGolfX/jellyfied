import type { EncodingOptions, ServerConfiguration } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Select, Switch } from '@/components/ui/Form';
import { PageSpinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { Card } from '@/pages/Settings';
import { AdminPage, useConfigEditor } from './shared';
import { useDraft } from '@/lib/useDraft';
import { t } from '@/i18n';

const HW_ACCEL = [
  { value: 'none', label: t('admin.playback.noneSoftware') },
  { value: 'qsv', label: t('admin.playback.intelQuickSyncQsv') },
  { value: 'vaapi', label: t('admin.playback.vaapi') },
  { value: 'nvenc', label: t('admin.playback.nvidiaNvenc') },
  { value: 'amf', label: t('admin.playback.amdAmf') },
  { value: 'videotoolbox', label: t('admin.playback.appleVideotoolbox') },
  { value: 'v4l2m2m', label: t('admin.playback.v4l2') },
  { value: 'rkmpp', label: t('admin.playback.rockchipMppRkmpp') },
];

const DECODE_CODECS = ['h264', 'hevc', 'mpeg2video', 'mpeg4', 'vc1', 'vp8', 'vp9', 'av1'];

const PRESETS = ['', 'veryslow', 'slower', 'slow', 'medium', 'fast', 'faster', 'veryfast', 'superfast', 'ultrafast'];

export default function PlaybackPage() {
  const encoding = useConfigEditor<EncodingOptions>('/System/Configuration/encoding', t('admin.playback.transcodingSettings'));
  const server = useConfigEditor<ServerConfiguration>('/System/Configuration', t('admin.playback.resumeSettings'));
  const [enc, setEnc] = useDraft(encoding.query.data);
  const [srv, setSrv] = useDraft(server.query.data);

  if (encoding.query.error) return <ErrorState error={encoding.query.error} onRetry={() => encoding.query.refetch()} />;
  if (!enc || !srv) return <PageSpinner />;

  const e = <K extends keyof EncodingOptions>(k: K, v: EncodingOptions[K]) => setEnc((c) => (c ? { ...c, [k]: v } : c));
  const s = <K extends keyof ServerConfiguration>(k: K, v: ServerConfiguration[K]) => setSrv((c) => (c ? { ...c, [k]: v } : c));
  const num = (v: string, fallback = 0) => (v === '' || Number.isNaN(Number(v)) ? fallback : Number(v));
  const hw = enc.HardwareAccelerationType;

  const toggleCodec = (codec: string, on: boolean) => {
    const set = new Set(enc.HardwareDecodingCodecs ?? []);
    if (on) set.add(codec);
    else set.delete(codec);
    e('HardwareDecodingCodecs', [...set]);
  };

  return (
    <AdminPage
      title={t('common.transcoding')}
      description={t('admin.playback.description')}
      actions={
        <Button
          variant="primary"
          loading={encoding.save.isPending || server.save.isPending}
          onClick={() => {
            encoding.save.mutate(enc);
            server.save.mutate(srv);
          }}
        >
          {t('common.saveChanges')}
        </Button>
      }
    >
      <Card title={t('admin.playback.hardwareAcceleration')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('admin.playback.acceleration')}>
            <Select value={hw} onChange={(ev) => e('HardwareAccelerationType', ev.target.value)}>
              {HW_ACCEL.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </Select>
          </Field>
          {hw === 'vaapi' && (
            <Field label={t('admin.playback.vaapiDevice')}>
              <Input className="font-mono" value={enc.VaapiDevice ?? ''} onChange={(ev) => e('VaapiDevice', ev.target.value)} />
            </Field>
          )}
          {hw === 'qsv' && 'QsvDevice' in enc && (
            <Field label={t('admin.playback.qsvDevice')} hint={t('admin.playback.optional')}>
              <Input className="font-mono" value={enc.QsvDevice ?? ''} onChange={(ev) => e('QsvDevice', ev.target.value)} />
            </Field>
          )}
        </div>
        {hw !== 'none' && (
          <>
            <div className="mt-4 mb-1 text-sm font-medium">{t('admin.playback.hardwareDecodingFor')}</div>
            <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-4">
              {DECODE_CODECS.map((c) => (
                <Checkbox
                  key={c}
                  label={c.toUpperCase()}
                  checked={(enc.HardwareDecodingCodecs ?? []).includes(c)}
                  onChange={(v) => toggleCodec(c, v)}
                />
              ))}
            </div>
            <div className="mt-3 divide-y divide-white/5">
              <Switch
                label={t('admin.playback.enableHardwareEncoding')}
                checked={enc.EnableHardwareEncoding}
                onChange={(v) => e('EnableHardwareEncoding', v)}
              />
              <Switch
                label={t('admin.playback.hevc10BitDecoding')}
                checked={enc.EnableDecodingColorDepth10Hevc}
                onChange={(v) => e('EnableDecodingColorDepth10Hevc', v)}
              />
              <Switch
                label={t('admin.playback.vp9TenBitDecoding')}
                checked={enc.EnableDecodingColorDepth10Vp9}
                onChange={(v) => e('EnableDecodingColorDepth10Vp9', v)}
              />
            </div>
          </>
        )}
      </Card>

      <Card title={t('admin.playback.encoding')}>
        <div className="divide-y divide-white/5">
          <Switch
            label={t('admin.playback.allowHevcEncoding')}
            checked={enc.AllowHevcEncoding}
            onChange={(v) => e('AllowHevcEncoding', v)}
          />
          {'AllowAv1Encoding' in enc && (
            <Switch
              label={t('admin.playback.allowAv1Encoding')}
              checked={enc.AllowAv1Encoding}
              onChange={(v) => e('AllowAv1Encoding', v)}
            />
          )}
          <Switch
            label={t('admin.playback.enableToneMapping')}
            description={t('admin.playback.tonemappingHint')}
            checked={enc.EnableTonemapping}
            onChange={(v) => e('EnableTonemapping', v)}
          />
          <Switch
            label={t('admin.playback.subtitleExtraction')}
            checked={enc.EnableSubtitleExtraction}
            onChange={(v) => e('EnableSubtitleExtraction', v)}
          />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('admin.playback.encodingThreads')} hint={t('admin.playback.minusOneAutomatic')}>
            <Input
              type="number"
              min={-1}
              value={enc.EncodingThreadCount}
              onChange={(ev) => e('EncodingThreadCount', num(ev.target.value, -1))}
            />
          </Field>
          <Field label={t('admin.playback.encoderPreset')}>
            <Select value={enc.EncoderPreset ?? ''} onChange={(ev) => e('EncoderPreset', ev.target.value || null)}>
              {PRESETS.map((p) => (
                <option key={p} value={p}>
                  {p || t('admin.playback.auto')}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('admin.playback.h264Crf')} hint={t('admin.playback.lowerBetterQuality')}>
            <Input type="number" min={0} max={51} value={enc.H264Crf} onChange={(ev) => e('H264Crf', num(ev.target.value, 23))} />
          </Field>
          <Field label={t('admin.playback.h265Crf')}>
            <Input type="number" min={0} max={51} value={enc.H265Crf} onChange={(ev) => e('H265Crf', num(ev.target.value, 28))} />
          </Field>
          <Field label={t('admin.playback.audioDownmixBoost')}>
            <Input
              type="number"
              step={0.1}
              min={0.5}
              max={3}
              value={enc.DownMixAudioBoost}
              onChange={(ev) => e('DownMixAudioBoost', num(ev.target.value, 2))}
            />
          </Field>
        </div>
        <div className="mt-4">
          <Field label={t('admin.playback.transcodePath')} hint={t('admin.playback.leaveEmptyForTheDefault')}>
            <Input
              className="font-mono"
              value={enc.TranscodingTempPath ?? ''}
              onChange={(ev) => e('TranscodingTempPath', ev.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card title={t('admin.playback.throttlingSegments')}>
        <div className="divide-y divide-white/5">
          <Switch
            label={t('admin.playback.throttleTranscodes')}
            description={t('admin.playback.throttleHint')}
            checked={enc.EnableThrottling}
            onChange={(v) => e('EnableThrottling', v)}
          />
          <Switch
            label={t('admin.playback.deleteOldSegments')}
            description={t('admin.playback.segmentDeletionHint')}
            checked={enc.EnableSegmentDeletion}
            onChange={(v) => e('EnableSegmentDeletion', v)}
          />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={t('admin.playback.throttleAfterSeconds')}>
            <Input
              type="number"
              min={0}
              value={enc.ThrottleDelaySeconds}
              onChange={(ev) => e('ThrottleDelaySeconds', num(ev.target.value, 180))}
            />
          </Field>
          <Field label={t('admin.playback.keepSegmentsForSeconds')}>
            <Input
              type="number"
              min={0}
              value={enc.SegmentKeepSeconds}
              onChange={(ev) => e('SegmentKeepSeconds', num(ev.target.value, 720))}
            />
          </Field>
        </div>
      </Card>

      <Card title={t('admin.playback.resume')} description={t('admin.playback.resumeDescription')}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('admin.playback.minimumResume')} hint={t('admin.playback.belowThisProgressIsnT')}>
            <Input type="number" min={0} max={100} value={srv.MinResumePct} onChange={(ev) => s('MinResumePct', num(ev.target.value, 5))} />
          </Field>
          <Field label={t('admin.playback.maximumResume')} hint={t('admin.playback.maxResumeHint')}>
            <Input
              type="number"
              min={1}
              max={100}
              value={srv.MaxResumePct}
              onChange={(ev) => s('MaxResumePct', num(ev.target.value, 90))}
            />
          </Field>
          <Field label={t('admin.playback.minimumDurationSeconds')} hint={t('admin.playback.minResumeDurationHint')}>
            <Input
              type="number"
              min={0}
              value={srv.MinResumeDurationSeconds}
              onChange={(ev) => s('MinResumeDurationSeconds', num(ev.target.value, 300))}
            />
          </Field>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label={t('admin.playback.remoteBitrateLimit')} hint={t('admin.playback.zeroNoLimit')}>
            <Input
              type="number"
              min={0}
              step={0.5}
              value={srv.RemoteClientBitrateLimit ? srv.RemoteClientBitrateLimit / 1_000_000 : 0}
              onChange={(ev) => s('RemoteClientBitrateLimit', Math.round(num(ev.target.value) * 1_000_000))}
            />
          </Field>
        </div>
      </Card>
    </AdminPage>
  );
}
