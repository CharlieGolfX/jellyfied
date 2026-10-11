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

export default function GeneralPage() {
  const api = useApi();
  const { query, save } = useConfigEditor<ServerConfiguration>('/System/Configuration', 'Server settings');
  const cultures = useQuery({
    queryKey: ['cultures'],
    queryFn: () => api.get<CultureDto[]>('/Localization/Cultures'),
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
      title="General"
      description="Server-wide settings. Changes to paths may require a restart."
      actions={
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(draft)}>
          Save changes
        </Button>
      }
    >
      <Card title="Server">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Server name" hint="Shown to clients and on the login screen.">
            <Input value={draft.ServerName ?? ''} onChange={(e) => set('ServerName', e.target.value)} />
          </Field>
          <Field label="Display language (server UI)">
            <Select value={draft.UICulture ?? ''} onChange={(e) => set('UICulture', e.target.value)}>
              {(cultures.data ?? [])
                .slice()
                .sort((a, b) => a.DisplayName.localeCompare(b.DisplayName))
                .map((c) => (
                  <option key={c.Name} value={c.Name}>
                    {c.DisplayName}
                  </option>
                ))}
              {!cultures.data && <option value={draft.UICulture}>{draft.UICulture}</option>}
            </Select>
          </Field>
        </div>
        <div className="mt-3 divide-y divide-white/5">
          <Switch
            label="Enable Quick Connect"
            description="Allow signing in on new devices with a code from an existing session."
            checked={draft.QuickConnectAvailable}
            onChange={(v) => set('QuickConnectAvailable', v)}
          />
        </div>
      </Card>

      <Card title="Metadata">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Preferred metadata language">
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
          <Field label="Country">
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

      <Card title="Library behaviour">
        <div className="divide-y divide-white/5">
          <Switch
            label="Display a folder view"
            description="Show plain media folders alongside libraries."
            checked={draft.EnableFolderView}
            onChange={(v) => set('EnableFolderView', v)}
          />
          <Switch
            label="Group movies into collections"
            description="Movies that belong to a collection are shown as a single grouped item in movie lists."
            checked={draft.EnableGroupingMoviesIntoCollections}
            onChange={(v) => set('EnableGroupingMoviesIntoCollections', v)}
          />
          <Switch
            label="Display specials within the seasons they aired in"
            checked={draft.DisplaySpecialsWithinSeasons}
            onChange={(v) => set('DisplaySpecialsWithinSeasons', v)}
          />
          <Switch
            label="Include external content in suggestions"
            checked={draft.EnableExternalContentInSuggestions}
            onChange={(v) => set('EnableExternalContentInSuggestions', v)}
          />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Library monitor delay (seconds)" hint="Wait time after file changes before scanning.">
            <Input
              type="number"
              min={0}
              value={draft.LibraryMonitorDelay ?? 0}
              onChange={(e) => set('LibraryMonitorDelay', num(e.target.value, 60))}
            />
          </Field>
          {'LibraryScanFanoutConcurrency' in draft && (
            <Field label="Parallel library scan tasks" hint="0 uses the number of CPU cores.">
              <Input
                type="number"
                min={0}
                value={draft.LibraryScanFanoutConcurrency ?? 0}
                onChange={(e) => set('LibraryScanFanoutConcurrency', num(e.target.value))}
              />
            </Field>
          )}
          {'ParallelImageEncodingLimit' in draft && (
            <Field label="Parallel image encoding limit" hint="0 uses the number of CPU cores.">
              <Input
                type="number"
                min={0}
                value={draft.ParallelImageEncodingLimit ?? 0}
                onChange={(e) => set('ParallelImageEncodingLimit', num(e.target.value))}
              />
            </Field>
          )}
          {'ActivityLogRetentionDays' in draft && (
            <Field label="Activity log retention (days)" hint="Leave empty to keep forever.">
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

      <Card title="Paths">
        <div className="grid gap-4">
          <Field label="Cache path" hint="Leave empty for the default.">
            <Input value={draft.CachePath ?? ''} onChange={(e) => set('CachePath', e.target.value)} className="font-mono" />
          </Field>
          <Field label="Metadata path" hint="Leave empty for the default.">
            <Input value={draft.MetadataPath ?? ''} onChange={(e) => set('MetadataPath', e.target.value)} className="font-mono" />
          </Field>
        </div>
      </Card>
    </AdminPage>
  );
}
