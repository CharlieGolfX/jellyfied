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
import { t } from '@/i18n';

const RESOLUTIONS = ['MatchSource', 'P2160', 'P1440', 'P1080', 'P720', 'P480', 'P360', 'P240', 'P144'];
const resolutionLabel = (r: string) => (r === 'MatchSource' ? t('admin.metadata.sameAsTheVideo') : `${r.slice(1)}p`);
const PRIORITIES: [NonNullable<TrickplayOptions['ProcessPriority']>, string][] = [
  ['High', t('admin.metadata.priority.high')],
  ['AboveNormal', t('admin.metadata.aboveNormal')],
  ['Normal', t('admin.metadata.priority.normal')],
  ['BelowNormal', t('admin.metadata.belowNormal')],
  ['Idle', t('admin.metadata.priority.idle')],
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
      toast.success(t('admin.metadata.metadataSettingsSaved'));
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
      title={t('common.metadata')}
      description={t('admin.metadata.howTheServerDatesNew')}
      actions={
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
          {t('common.saveChanges')}
        </Button>
      }
    >
      <Card title={t('admin.metadata.dateAdded')}>
        <Field label={t('admin.metadata.forNewItemsUse')} className="max-w-md">
          <Select
            value={metadataDraft.UseFileCreationTimeForDateAdded ? 'file' : 'scan'}
            onChange={(e) => setMetadataDraft({ ...metadataDraft, UseFileCreationTimeForDateAdded: e.target.value === 'file' })}
          >
            <option value="file">{t('admin.metadata.theDateTheFileWas')}</option>
            <option value="scan">{t('admin.metadata.theDateItWasScanned')}</option>
          </Select>
        </Field>
      </Card>

      <Card title={t('admin.metadata.nfoFiles')} description={t('admin.metadata.forLibrariesThatSaveMetadata')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('admin.metadata.saveWatchDataToNfo')} hint={t('admin.metadata.letsOtherApplicationsReadWhat')}>
            <Select value={nfoDraft.UserId ?? ''} onChange={(e) => setNfo({ UserId: e.target.value || null })}>
              <option value="">{t('admin.metadata.nobody')}</option>
              {(users.data ?? []).map((u) => (
                <option key={u.Id} value={u.Id}>
                  {u.Name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('admin.metadata.releaseDateFormat')}>
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
            label={t('admin.metadata.saveImagePathsInNfo')}
            description={t('admin.metadata.forImagesWhoseFileNames')}
            checked={Boolean(nfoDraft.SaveImagePathsInNfo)}
            onChange={(v) => setNfo({ SaveImagePathsInNfo: v })}
          />
          <Switch
            label={t('admin.metadata.applyPathSubstitutionToImage')}
            checked={Boolean(nfoDraft.EnablePathSubstitution)}
            onChange={(v) => setNfo({ EnablePathSubstitution: v })}
          />
          <Switch
            label={t('admin.metadata.copyExtraFanArtTo')}
            description={t('admin.metadata.forKodiSkinsThatLook')}
            checked={Boolean(nfoDraft.EnableExtraThumbsDuplication)}
            onChange={(v) => setNfo({ EnableExtraThumbsDuplication: v })}
          />
        </div>
      </Card>

      {'DummyChapterDuration' in serverDraft && (
        <Card title={t('admin.metadata.chapters')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('admin.metadata.chapterLengthForVideosWithout')} hint={t('admin.metadata.n0MakesNoChapters')}>
              <Input
                type="number"
                min={0}
                value={Number(serverDraft.DummyChapterDuration ?? 0)}
                onChange={(e) => setServer({ DummyChapterDuration: num(e.target.value, 0) })}
              />
            </Field>
            <Field label={t('admin.metadata.chapterImageResolution')}>
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
        <Card title={t('admin.metadata.trickplay')} description={t('admin.metadata.thePreviewThumbnailsShownWhile')}>
          <div className="divide-y divide-white/5">
            <Switch
              label={t('admin.metadata.hardwareDecoding')}
              checked={Boolean(trickplay.EnableHwAcceleration)}
              onChange={(v) => setTrickplay({ EnableHwAcceleration: v })}
            />
            <Switch
              label={t('admin.metadata.hardwareAcceleratedJpegEncoding')}
              description={t('admin.metadata.onlyWithQsvVaApi')}
              checked={Boolean(trickplay.EnableHwEncoding)}
              onChange={(v) => setTrickplay({ EnableHwEncoding: v })}
            />
            <Switch
              label={t('admin.metadata.onlyUseKeyFrames')}
              description={t('admin.metadata.muchFasterWithLessExact')}
              checked={Boolean(trickplay.EnableKeyFrameOnlyExtraction)}
              onChange={(v) => setTrickplay({ EnableKeyFrameOnlyExtraction: v })}
            />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label={t('admin.metadata.duringALibraryScan')}>
              <Select
                value={trickplay.ScanBehavior ?? 'NonBlocking'}
                onChange={(e) => setTrickplay({ ScanBehavior: e.target.value as TrickplayOptions['ScanBehavior'] })}
              >
                <option value="NonBlocking">{t('admin.metadata.makeImagesAfterwards')}</option>
                <option value="Blocking">{t('admin.metadata.waitForTheImages')}</option>
              </Select>
            </Field>
            <Field label={t('admin.metadata.processPriority')}>
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
            <Field label={t('admin.metadata.imageEveryMilliseconds')}>
              <Input
                type="number"
                min={1000}
                step={1000}
                value={trickplay.Interval ?? 10000}
                onChange={(e) => setTrickplay({ Interval: num(e.target.value, 10000) })}
              />
            </Field>
            <Field label={t('admin.metadata.widthsPixels')} hint={t('admin.metadata.oneSetOfImagesPer')}>
              <Input value={widths ?? ''} onChange={(e) => setWidths(e.target.value)} />
            </Field>
            <Field label={t('admin.metadata.imagesPerRowOfA')}>
              <Input
                type="number"
                min={1}
                value={trickplay.TileWidth ?? 10}
                onChange={(e) => setTrickplay({ TileWidth: num(e.target.value, 10) })}
              />
            </Field>
            <Field label={t('admin.metadata.rowsPerTile')}>
              <Input
                type="number"
                min={1}
                value={trickplay.TileHeight ?? 10}
                onChange={(e) => setTrickplay({ TileHeight: num(e.target.value, 10) })}
              />
            </Field>
            <Field label={t('admin.metadata.jpegQuality')} hint={t('admin.metadata.n0To100')}>
              <Input
                type="number"
                min={0}
                max={100}
                value={trickplay.JpegQuality ?? 90}
                onChange={(e) => setTrickplay({ JpegQuality: num(e.target.value, 90) })}
              />
            </Field>
            <Field label={t('admin.metadata.qualityScale')} hint={t('admin.metadata.n2BestTo31')}>
              <Input
                type="number"
                min={2}
                max={31}
                value={trickplay.Qscale ?? 4}
                onChange={(e) => setTrickplay({ Qscale: num(e.target.value, 4) })}
              />
            </Field>
            <Field label={t('admin.metadata.threads')} hint={t('admin.metadata.n0LetsFfmpegDecide')}>
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
