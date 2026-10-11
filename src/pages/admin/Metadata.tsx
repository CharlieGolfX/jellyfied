import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MetadataConfiguration, TrickplayOptions, XbmcMetadataOptions } from '@/api/generated';
import type { ServerConfiguration, UserDto } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Switch } from '@/components/ui/Form';
import { PageSpinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useDraft } from '@/lib/useDraft';
import { Card } from '@/pages/Settings';
import { AdminPage } from './shared';

const RESOLUTIONS = ['MatchSource', 'P2160', 'P1440', 'P1080', 'P720', 'P480', 'P360', 'P240', 'P144'];
const resolutionLabel = (r: string) => (r === 'MatchSource' ? 'Same as the video' : `${r.slice(1)}p`);
const PRIORITIES: [NonNullable<TrickplayOptions['ProcessPriority']>, string][] = [
  ['High', 'High'],
  ['AboveNormal', 'Above normal'],
  ['Normal', 'Normal'],
  ['BelowNormal', 'Below normal'],
  ['Idle', 'Idle'],
];
const DATE_FORMATS = ['yyyy-MM-dd', 'dd.MM.yyyy', 'dd/MM/yyyy', 'MM/dd/yyyy'];

const num = (v: string, fallback: number) => (v === '' || Number.isNaN(Number(v)) ? fallback : Number(v));
/** "320, 480" as numbers; anything that is not a width is dropped. */
export function parseWidths(text: string): number[] {
  return text
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
}

export default function MetadataPage() {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();
  const server = useQuery({
    queryKey: ['admin', 'config', '/System/Configuration'],
    queryFn: () => api.get<ServerConfiguration>('/System/Configuration'),
  });
  const metadata = useQuery({
    queryKey: ['admin', 'config', 'metadata'],
    queryFn: () => api.get<MetadataConfiguration>('/System/Configuration/metadata'),
  });
  const nfo = useQuery({
    queryKey: ['admin', 'config', 'xbmcmetadata'],
    queryFn: () => api.get<XbmcMetadataOptions>('/System/Configuration/xbmcmetadata'),
  });
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api.get<UserDto[]>('/Users') });

  const [serverDraft, setServerDraft] = useDraft(server.data);
  const [metadataDraft, setMetadataDraft] = useDraft(metadata.data);
  const [nfoDraft, setNfoDraft] = useDraft(nfo.data);
  // Typed as text so a half-written list is not rewritten under the cursor.
  const [widths, setWidths] = useDraft(
    server.data ? ((server.data.TrickplayOptions as TrickplayOptions | undefined)?.WidthResolutions ?? []).join(', ') : undefined,
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!serverDraft || !metadataDraft || !nfoDraft) return;
      const trickplay = serverDraft.TrickplayOptions as TrickplayOptions | undefined;
      await api.post('/System/Configuration', {
        ...serverDraft,
        ...(trickplay ? { TrickplayOptions: { ...trickplay, WidthResolutions: parseWidths(widths ?? '') } } : {}),
      });
      await api.post('/System/Configuration/metadata', metadataDraft);
      await api.post('/System/Configuration/xbmcmetadata', nfoDraft);
    },
    onSuccess: () => {
      toast.success('Metadata settings saved');
      void qc.invalidateQueries({ queryKey: ['admin', 'config'] });
    },
    onError: (e) => toast.error(e),
  });

  const error = server.error ?? metadata.error ?? nfo.error;
  if (error) return <ErrorState error={error} onRetry={() => void Promise.all([server.refetch(), metadata.refetch(), nfo.refetch()])} />;
  if (!serverDraft || !metadataDraft || !nfoDraft) return <PageSpinner />;

  const trickplay = serverDraft.TrickplayOptions as TrickplayOptions | undefined;
  const setServer = (patch: Record<string, unknown>) => setServerDraft((d) => (d ? { ...d, ...patch } : d));
  const setTrickplay = (patch: Partial<TrickplayOptions>) => setServer({ TrickplayOptions: { ...trickplay, ...patch } });
  const setNfo = (patch: Partial<XbmcMetadataOptions>) => setNfoDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <AdminPage
      title="Metadata"
      description="How the server dates new items, writes NFO files and makes chapter and trickplay images. Language and country are under General; what each library fetches is under Libraries."
      actions={
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
          Save changes
        </Button>
      }
    >
      <Card title="Date added">
        <Field label="For new items, use" className="max-w-md">
          <Select
            value={metadataDraft.UseFileCreationTimeForDateAdded ? 'file' : 'scan'}
            onChange={(e) => setMetadataDraft({ ...metadataDraft, UseFileCreationTimeForDateAdded: e.target.value === 'file' })}
          >
            <option value="file">The date the file was created</option>
            <option value="scan">The date it was scanned into the library</option>
          </Select>
        </Field>
      </Card>

      <Card title="NFO files" description="For libraries that save metadata as NFO files next to the media, as Kodi does.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Save watch data to NFO files for" hint="Lets other applications read what this user has watched.">
            <Select value={nfoDraft.UserId ?? ''} onChange={(e) => setNfo({ UserId: e.target.value || null })}>
              <option value="">Nobody</option>
              {(users.data ?? []).map((u) => (
                <option key={u.Id} value={u.Id}>
                  {u.Name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Release date format">
            <Select value={nfoDraft.ReleaseDateFormat ?? DATE_FORMATS[0]} onChange={(e) => setNfo({ ReleaseDateFormat: e.target.value })}>
              {[...new Set([...DATE_FORMATS, nfoDraft.ReleaseDateFormat ?? DATE_FORMATS[0]])].map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-3 divide-y divide-white/5">
          <Switch
            label="Save image paths in NFO files"
            description="For images whose file names don't follow Kodi's naming."
            checked={Boolean(nfoDraft.SaveImagePathsInNfo)}
            onChange={(v) => setNfo({ SaveImagePathsInNfo: v })}
          />
          <Switch
            label="Apply path substitution to image paths"
            checked={Boolean(nfoDraft.EnablePathSubstitution)}
            onChange={(v) => setNfo({ EnablePathSubstitution: v })}
          />
          <Switch
            label="Copy extra fan art to the extrathumbs folder"
            description="For Kodi skins that look for it there."
            checked={Boolean(nfoDraft.EnableExtraThumbsDuplication)}
            onChange={(v) => setNfo({ EnableExtraThumbsDuplication: v })}
          />
        </div>
      </Card>

      {'DummyChapterDuration' in serverDraft && (
        <Card title="Chapters">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Chapter length for videos without chapters (seconds)" hint="0 makes no chapters.">
              <Input
                type="number"
                min={0}
                value={Number(serverDraft.DummyChapterDuration ?? 0)}
                onChange={(e) => setServer({ DummyChapterDuration: num(e.target.value, 0) })}
              />
            </Field>
            <Field label="Chapter image resolution">
              <Select
                value={String(serverDraft.ChapterImageResolution ?? 'MatchSource')}
                onChange={(e) => setServer({ ChapterImageResolution: e.target.value })}
              >
                {RESOLUTIONS.map((r) => (
                  <option key={r} value={r}>
                    {resolutionLabel(r)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>
      )}

      {trickplay && (
        <Card
          title="Trickplay"
          description="The preview thumbnails shown while seeking. They are made per library, when it is turned on under Libraries."
        >
          <div className="divide-y divide-white/5">
            <Switch
              label="Hardware decoding"
              checked={Boolean(trickplay.EnableHwAcceleration)}
              onChange={(v) => setTrickplay({ EnableHwAcceleration: v })}
            />
            <Switch
              label="Hardware-accelerated JPEG encoding"
              description="Only with QSV, VA-API, VideoToolbox and RKMPP."
              checked={Boolean(trickplay.EnableHwEncoding)}
              onChange={(v) => setTrickplay({ EnableHwEncoding: v })}
            />
            <Switch
              label="Only use key frames"
              description="Much faster, with less exact timing."
              checked={Boolean(trickplay.EnableKeyFrameOnlyExtraction)}
              onChange={(v) => setTrickplay({ EnableKeyFrameOnlyExtraction: v })}
            />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="During a library scan">
              <Select
                value={trickplay.ScanBehavior ?? 'NonBlocking'}
                onChange={(e) => setTrickplay({ ScanBehavior: e.target.value as TrickplayOptions['ScanBehavior'] })}
              >
                <option value="NonBlocking">Make images afterwards</option>
                <option value="Blocking">Wait for the images</option>
              </Select>
            </Field>
            <Field label="Process priority">
              <Select
                value={trickplay.ProcessPriority ?? 'BelowNormal'}
                onChange={(e) => setTrickplay({ ProcessPriority: e.target.value as TrickplayOptions['ProcessPriority'] })}
              >
                {PRIORITIES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Image every (milliseconds)">
              <Input
                type="number"
                min={1000}
                step={1000}
                value={trickplay.Interval ?? 10000}
                onChange={(e) => setTrickplay({ Interval: num(e.target.value, 10000) })}
              />
            </Field>
            <Field label="Widths (pixels)" hint="One set of images per width, separated by commas.">
              <Input value={widths ?? ''} onChange={(e) => setWidths(e.target.value)} />
            </Field>
            <Field label="Images per row of a tile">
              <Input
                type="number"
                min={1}
                value={trickplay.TileWidth ?? 10}
                onChange={(e) => setTrickplay({ TileWidth: num(e.target.value, 10) })}
              />
            </Field>
            <Field label="Rows per tile">
              <Input
                type="number"
                min={1}
                value={trickplay.TileHeight ?? 10}
                onChange={(e) => setTrickplay({ TileHeight: num(e.target.value, 10) })}
              />
            </Field>
            <Field label="JPEG quality" hint="0 to 100">
              <Input
                type="number"
                min={0}
                max={100}
                value={trickplay.JpegQuality ?? 90}
                onChange={(e) => setTrickplay({ JpegQuality: num(e.target.value, 90) })}
              />
            </Field>
            <Field label="Quality scale" hint="2 (best) to 31">
              <Input
                type="number"
                min={2}
                max={31}
                value={trickplay.Qscale ?? 4}
                onChange={(e) => setTrickplay({ Qscale: num(e.target.value, 4) })}
              />
            </Field>
            <Field label="Threads" hint="0 lets ffmpeg decide.">
              <Input
                type="number"
                min={0}
                value={trickplay.ProcessThreads ?? 0}
                onChange={(e) => setTrickplay({ ProcessThreads: num(e.target.value, 0) })}
              />
            </Field>
          </div>
        </Card>
      )}
    </AdminPage>
  );
}
