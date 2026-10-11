import type { EncodingOptions, ServerConfiguration } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Select, Switch } from '@/components/ui/Form';
import { PageSpinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { Card } from '@/pages/Settings';
import { AdminPage, useConfigEditor } from './shared';
import { useDraft } from '@/lib/useDraft';

const HW_ACCEL = [
  { value: 'none', label: 'None (software)' },
  { value: 'qsv', label: 'Intel Quick Sync (QSV)' },
  { value: 'vaapi', label: 'Video Acceleration API (VA-API)' },
  { value: 'nvenc', label: 'NVIDIA NVENC' },
  { value: 'amf', label: 'AMD AMF' },
  { value: 'videotoolbox', label: 'Apple VideoToolbox' },
  { value: 'v4l2m2m', label: 'Video4Linux2 (V4L2)' },
  { value: 'rkmpp', label: 'Rockchip MPP (RKMPP)' },
];

const DECODE_CODECS = ['h264', 'hevc', 'mpeg2video', 'mpeg4', 'vc1', 'vp8', 'vp9', 'av1'];

const PRESETS = ['', 'veryslow', 'slower', 'slow', 'medium', 'fast', 'faster', 'veryfast', 'superfast', 'ultrafast'];

export default function PlaybackPage() {
  const encoding = useConfigEditor<EncodingOptions>('/System/Configuration/encoding', 'Transcoding settings');
  const server = useConfigEditor<ServerConfiguration>('/System/Configuration', 'Resume settings');
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
      title="Transcoding"
      description="Configure how Jellyfin converts media for devices that can’t play it directly."
      actions={
        <Button
          variant="primary"
          loading={encoding.save.isPending || server.save.isPending}
          onClick={() => {
            encoding.save.mutate(enc);
            server.save.mutate(srv);
          }}
        >
          Save changes
        </Button>
      }
    >
      <Card title="Hardware acceleration">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Acceleration">
            <Select value={hw} onChange={(ev) => e('HardwareAccelerationType', ev.target.value)}>
              {HW_ACCEL.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </Select>
          </Field>
          {hw === 'vaapi' && (
            <Field label="VA-API device">
              <Input className="font-mono" value={enc.VaapiDevice ?? ''} onChange={(ev) => e('VaapiDevice', ev.target.value)} />
            </Field>
          )}
          {hw === 'qsv' && 'QsvDevice' in enc && (
            <Field label="QSV device" hint="Optional">
              <Input className="font-mono" value={enc.QsvDevice ?? ''} onChange={(ev) => e('QsvDevice', ev.target.value)} />
            </Field>
          )}
        </div>
        {hw !== 'none' && (
          <>
            <div className="mt-4 mb-1 text-sm font-medium">Hardware decoding for</div>
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
                label="Enable hardware encoding"
                checked={enc.EnableHardwareEncoding}
                onChange={(v) => e('EnableHardwareEncoding', v)}
              />
              <Switch
                label="Enable 10-bit HEVC hardware decoding"
                checked={enc.EnableDecodingColorDepth10Hevc}
                onChange={(v) => e('EnableDecodingColorDepth10Hevc', v)}
              />
              <Switch
                label="Enable 10-bit VP9 hardware decoding"
                checked={enc.EnableDecodingColorDepth10Vp9}
                onChange={(v) => e('EnableDecodingColorDepth10Vp9', v)}
              />
            </div>
          </>
        )}
      </Card>

      <Card title="Encoding">
        <div className="divide-y divide-white/5">
          <Switch label="Allow encoding in HEVC format" checked={enc.AllowHevcEncoding} onChange={(v) => e('AllowHevcEncoding', v)} />
          {'AllowAv1Encoding' in enc && (
            <Switch label="Allow encoding in AV1 format" checked={enc.AllowAv1Encoding} onChange={(v) => e('AllowAv1Encoding', v)} />
          )}
          <Switch
            label="Enable tone mapping"
            description="Convert HDR to SDR when transcoding. Requires a capable GPU or significant CPU."
            checked={enc.EnableTonemapping}
            onChange={(v) => e('EnableTonemapping', v)}
          />
          <Switch
            label="Allow subtitle extraction on the fly"
            checked={enc.EnableSubtitleExtraction}
            onChange={(v) => e('EnableSubtitleExtraction', v)}
          />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Encoding threads" hint="-1 = automatic">
            <Input
              type="number"
              min={-1}
              value={enc.EncodingThreadCount}
              onChange={(ev) => e('EncodingThreadCount', num(ev.target.value, -1))}
            />
          </Field>
          <Field label="Encoder preset">
            <Select value={enc.EncoderPreset ?? ''} onChange={(ev) => e('EncoderPreset', ev.target.value || null)}>
              {PRESETS.map((p) => (
                <option key={p} value={p}>
                  {p || 'Auto'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="H.264 CRF" hint="Lower = better quality">
            <Input type="number" min={0} max={51} value={enc.H264Crf} onChange={(ev) => e('H264Crf', num(ev.target.value, 23))} />
          </Field>
          <Field label="H.265 CRF">
            <Input type="number" min={0} max={51} value={enc.H265Crf} onChange={(ev) => e('H265Crf', num(ev.target.value, 28))} />
          </Field>
          <Field label="Audio downmix boost">
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
          <Field label="Transcode path" hint="Leave empty for the default.">
            <Input
              className="font-mono"
              value={enc.TranscodingTempPath ?? ''}
              onChange={(ev) => e('TranscodingTempPath', ev.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card title="Throttling & segments">
        <div className="divide-y divide-white/5">
          <Switch
            label="Throttle transcodes"
            description="Pause transcoding once enough is buffered ahead of the playback position."
            checked={enc.EnableThrottling}
            onChange={(v) => e('EnableThrottling', v)}
          />
          <Switch
            label="Delete old segments"
            description="Remove already-played segments to save disk space."
            checked={enc.EnableSegmentDeletion}
            onChange={(v) => e('EnableSegmentDeletion', v)}
          />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Throttle after (seconds)">
            <Input
              type="number"
              min={0}
              value={enc.ThrottleDelaySeconds}
              onChange={(ev) => e('ThrottleDelaySeconds', num(ev.target.value, 180))}
            />
          </Field>
          <Field label="Keep segments for (seconds)">
            <Input
              type="number"
              min={0}
              value={enc.SegmentKeepSeconds}
              onChange={(ev) => e('SegmentKeepSeconds', num(ev.target.value, 720))}
            />
          </Field>
        </div>
      </Card>

      <Card title="Resume" description="When playback progress is saved and when an item counts as watched.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Minimum resume %" hint="Below this, progress isn’t saved.">
            <Input type="number" min={0} max={100} value={srv.MinResumePct} onChange={(ev) => s('MinResumePct', num(ev.target.value, 5))} />
          </Field>
          <Field label="Maximum resume %" hint="Above this, the item is marked watched.">
            <Input
              type="number"
              min={1}
              max={100}
              value={srv.MaxResumePct}
              onChange={(ev) => s('MaxResumePct', num(ev.target.value, 90))}
            />
          </Field>
          <Field label="Minimum duration (seconds)" hint="Shorter items are never resumable.">
            <Input
              type="number"
              min={0}
              value={srv.MinResumeDurationSeconds}
              onChange={(ev) => s('MinResumeDurationSeconds', num(ev.target.value, 300))}
            />
          </Field>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Remote client bitrate limit (Mbps)" hint="0 = no limit">
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
