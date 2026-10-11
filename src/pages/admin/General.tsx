import { useQuery } from '@tanstack/react-query';
import type { CountryInfo, CultureDto, ServerConfiguration } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Switch } from '@/components/ui/Form';
import { PageSpinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { Card } from '@/pages/Settings';
import { AdminPage, useConfigEditor } from './shared';
import { useDraft } from '@/lib/useDraft';
import { t } from '@/i18n';

export default function GeneralPage() {
  const api = useApi();
  const { query, save } = useConfigEditor<ServerConfiguration>('/System/Configuration', t('admin.general.serverSettings'));
  const cultures = useQuery({
    queryKey: ['cultures'],
    queryFn: () => api.get<CultureDto[]>('/Localization/Cultures'),
    staleTime: Infinity,
  });
  // The languages the server's own text has been translated to, as opposed to every language it knows of.
  const uiLanguages = useQuery({
    queryKey: ['localization-options'],
    queryFn: () => api.get<{ Name?: string | null; Value?: string | null }[]>('/Localization/Options'),
    staleTime: Infinity,
  });
  const countries = useQuery({
    queryKey: ['countries'],
    queryFn: () => api.get<CountryInfo[]>('/Localization/Countries'),
    staleTime: Infinity,
  });
  const [draft, setDraft] = useDraft(query.data);

  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (!draft) return <PageSpinner />;

  const set = <K extends keyof ServerConfiguration>(k: K, v: ServerConfiguration[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const num = (v: string, fallback = 0) => (v === '' || Number.isNaN(Number(v)) ? fallback : Number(v));

  return (
    <AdminPage
      title={t('admin.general.general')}
      description={t('admin.general.serverWideSettingsChangesTo')}
      actions={
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(draft)}>
          {t('common.saveChanges')}
        </Button>
      }
    >
      <Card title={t('admin.general.server')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('admin.general.serverName')} hint={t('admin.general.shownToClientsAndOn')}>
            <Input value={draft.ServerName ?? ''} onChange={(e) => set('ServerName', e.target.value)} />
          </Field>
          <Field label={t('admin.general.displayLanguageServerUi')} hint={t('admin.general.usedForTextTheServer')}>
            <Select value={draft.UICulture ?? ''} onChange={(e) => set('UICulture', e.target.value)}>
              {(Array.isArray(uiLanguages.data) ? uiLanguages.data : [])
                .filter((l) => l.Value)
                .sort((a, b) => (a.Name ?? '').localeCompare(b.Name ?? ''))
                .map((l) => (
                  <option key={l.Value} value={l.Value ?? ''}>
                    {l.Name ?? l.Value}
                  </option>
                ))}
              {/* The saved value stays selectable while the list loads, or if the server no longer offers it. */}
              {draft.UICulture && !(Array.isArray(uiLanguages.data) && uiLanguages.data.some((l) => l.Value === draft.UICulture)) && (
                <option value={draft.UICulture}>{draft.UICulture}</option>
              )}
            </Select>
          </Field>
        </div>
        <div className="mt-3 divide-y divide-white/5">
          <Switch
            label={t('admin.general.enableQuickConnect')}
            description={t('admin.general.allowSigningInOnNew')}
            checked={draft.QuickConnectAvailable}
            onChange={(v) => set('QuickConnectAvailable', v)}
          />
        </div>
      </Card>

      <Card title={t('common.metadata')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('admin.general.preferredMetadataLanguage')}>
            <Select value={draft.PreferredMetadataLanguage ?? ''} onChange={(e) => set('PreferredMetadataLanguage', e.target.value)}>
              {(cultures.data ?? [])
                .slice()
                .sort((a, b) => a.DisplayName.localeCompare(b.DisplayName))
                .map((c) => (
                  <option key={c.Name} value={c.TwoLetterISOLanguageName}>
                    {c.DisplayName}
                  </option>
                ))}
              {!cultures.data && <option value={draft.PreferredMetadataLanguage}>{draft.PreferredMetadataLanguage}</option>}
            </Select>
          </Field>
          <Field label={t('admin.general.country')}>
            <Select value={draft.MetadataCountryCode ?? ''} onChange={(e) => set('MetadataCountryCode', e.target.value)}>
              {(countries.data ?? [])
                .slice()
                .sort((a, b) => (a.DisplayName ?? '').localeCompare(b.DisplayName ?? ''))
                .map((c) => (
                  <option key={c.TwoLetterISORegionName} value={c.TwoLetterISORegionName ?? ''}>
                    {c.DisplayName}
                  </option>
                ))}
              {!countries.data && <option value={draft.MetadataCountryCode}>{draft.MetadataCountryCode}</option>}
            </Select>
          </Field>
        </div>
      </Card>

      <Card title={t('admin.general.libraryBehaviour')}>
        <div className="divide-y divide-white/5">
          <Switch
            label={t('admin.general.displayAFolderView')}
            description={t('admin.general.showPlainMediaFoldersAlongside')}
            checked={draft.EnableFolderView}
            onChange={(v) => set('EnableFolderView', v)}
          />
          <Switch
            label={t('admin.general.groupMoviesIntoCollections')}
            description={t('admin.general.moviesThatBelongToA')}
            checked={draft.EnableGroupingMoviesIntoCollections}
            onChange={(v) => set('EnableGroupingMoviesIntoCollections', v)}
          />
          <Switch
            label={t('admin.general.displaySpecialsWithinTheSeasons')}
            checked={draft.DisplaySpecialsWithinSeasons}
            onChange={(v) => set('DisplaySpecialsWithinSeasons', v)}
          />
          <Switch
            label={t('admin.general.includeExternalContentInSuggestions')}
            checked={draft.EnableExternalContentInSuggestions}
            onChange={(v) => set('EnableExternalContentInSuggestions', v)}
          />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={t('admin.general.libraryMonitorDelaySeconds')} hint={t('admin.general.waitTimeAfterFileChanges')}>
            <Input
              type="number"
              min={0}
              value={draft.LibraryMonitorDelay ?? 0}
              onChange={(e) => set('LibraryMonitorDelay', num(e.target.value, 60))}
            />
          </Field>
          {'LibraryScanFanoutConcurrency' in draft && (
            <Field label={t('admin.general.parallelLibraryScanTasks')} hint={t('admin.general.n0UsesTheNumberOf')}>
              <Input
                type="number"
                min={0}
                value={draft.LibraryScanFanoutConcurrency ?? 0}
                onChange={(e) => set('LibraryScanFanoutConcurrency', num(e.target.value))}
              />
            </Field>
          )}
          {'ParallelImageEncodingLimit' in draft && (
            <Field label={t('admin.general.parallelImageEncodingLimit')} hint={t('admin.general.n0UsesTheNumberOf')}>
              <Input
                type="number"
                min={0}
                value={draft.ParallelImageEncodingLimit ?? 0}
                onChange={(e) => set('ParallelImageEncodingLimit', num(e.target.value))}
              />
            </Field>
          )}
          {'ActivityLogRetentionDays' in draft && (
            <Field label={t('admin.general.activityLogRetentionDays')} hint={t('admin.general.leaveEmptyToKeepForever')}>
              <Input
                type="number"
                min={1}
                value={draft.ActivityLogRetentionDays ?? ''}
                onChange={(e) => set('ActivityLogRetentionDays', e.target.value === '' ? null : num(e.target.value, 30))}
              />
            </Field>
          )}
        </div>
      </Card>

      <Card title={t('admin.general.paths')}>
        <div className="grid gap-4">
          <Field label={t('admin.general.cachePath')} hint={t('admin.general.leaveEmptyForTheDefault')}>
            <Input value={draft.CachePath ?? ''} onChange={(e) => set('CachePath', e.target.value)} className="font-mono" />
          </Field>
          <Field label={t('admin.general.metadataPath')} hint={t('admin.general.leaveEmptyForTheDefault')}>
            <Input value={draft.MetadataPath ?? ''} onChange={(e) => set('MetadataPath', e.target.value)} className="font-mono" />
          </Field>
        </div>
      </Card>
    </AdminPage>
  );
}
