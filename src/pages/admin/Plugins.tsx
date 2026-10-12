import clsx from 'clsx';
import { Download, ExternalLink, Plus, Power, Puzzle, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RepositoryInfo } from '@/api/generated';
import type { ConfigurationPageInfo, PackageInfo, PluginInfo } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Field, Input, Switch } from '@/components/ui/Form';
import { ConfirmDialog } from '@/components/ui/Modal';
import { PageSpinner } from '@/components/ui/Spinner';
import { ErrorState, Img } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useDraft } from '@/lib/useDraft';
import { AdminPage, StatusPill } from './shared';
import { t } from '@/i18n';

const STATUS_TONE: Record<PluginInfo['Status'], 'green' | 'amber' | 'red' | 'gray'> = {
  Active: 'green',
  Restart: 'amber',
  Deleted: 'gray',
  Superceded: 'gray',
  Malfunctioned: 'red',
  NotSupported: 'red',
  Disabled: 'gray',
};

function Installed() {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();
  const [removing, setRemoving] = useState<PluginInfo | null>(null);
  const plugins = useQuery({ queryKey: ['admin', 'plugins'], queryFn: () => api.get<PluginInfo[]>('/Plugins') });
  // Plugin settings pages are written for jellyfin-web, so "Configure" opens them there.
  const pages = useQuery({
    queryKey: ['admin', 'plugin-pages'],
    queryFn: () => api.get<ConfigurationPageInfo[]>('/web/ConfigurationPages'),
    staleTime: 5 * 60_000,
  });
  const configUrl = (p: PluginInfo) => {
    const id = p.Id.replace(/-/g, '').toLowerCase();
    const page = pages.data?.find((pg) => pg.PluginId?.replace(/-/g, '').toLowerCase() === id);
    return page ? `${api.serverUrl}/web/#/configurationpage?name=${encodeURIComponent(page.Name)}` : null;
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'plugins'] });

  const toggle = useMutation({
    mutationFn: (p: PluginInfo) => api.post(`/Plugins/${p.Id}/${p.Version}/${p.Status === 'Disabled' ? 'Enable' : 'Disable'}`),
    onSuccess: () => {
      toast.success(t('admin.plugins.updatedRestart'));
      void invalidate();
    },
    onError: (e) => toast.error(e),
  });
  const uninstall = useMutation({
    mutationFn: (p: PluginInfo) => api.delete(`/Plugins/${p.Id}/${p.Version}`),
    onSuccess: () => {
      toast.success(t('admin.plugins.pluginWillBeRemovedAfter'));
      setRemoving(null);
      void invalidate();
    },
    onError: (e) => toast.error(e),
  });

  if (plugins.isLoading) return <PageSpinner />;
  if (plugins.error) return <ErrorState error={plugins.error} onRetry={() => plugins.refetch()} />;

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2">
        {plugins.data!.map((p) => (
          <div key={`${p.Id}-${p.Version}`} className="flex gap-4 rounded-lg bg-base-800/70 p-4 ring-1 ring-white/5">
            <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded bg-base-750 text-faint">
              {p.HasImage ? (
                <Img
                  src={api.url(`/Plugins/${p.Id}/${p.Version}/Image`, {}, true)}
                  className="h-full w-full object-cover"
                  fallback={<Puzzle size={22} />}
                />
              ) : (
                <Puzzle size={22} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{p.Name}</span>
                <span className="text-xs text-faint">v{p.Version}</span>
                <StatusPill tone={STATUS_TONE[p.Status] ?? 'gray'}>
                  {p.Status === 'Restart' ? t('admin.plugins.restartRequired') : p.Status}
                </StatusPill>
              </div>
              {p.Description && <p className="mt-1 line-clamp-2 text-sm text-muted">{p.Description}</p>}
              <div className="mt-2 flex gap-2">
                {p.Status === 'Active' && configUrl(p) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<ExternalLink size={14} />}
                    onClick={() => window.open(configUrl(p)!, '_blank', 'noopener')}
                    title={t('admin.plugins.settingsHint')}
                  >
                    {t('admin.plugins.configure')}
                  </Button>
                )}
                {(p.Status === 'Active' || p.Status === 'Disabled') && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Power size={14} />}
                    loading={toggle.isPending && toggle.variables?.Id === p.Id}
                    onClick={() => toggle.mutate(p)}
                  >
                    {p.Status === 'Disabled' ? t('admin.plugins.enable') : t('admin.plugins.disable')}
                  </Button>
                )}
                {p.CanUninstall && (
                  <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setRemoving(p)}>
                    {t('admin.plugins.uninstall')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
        {plugins.data!.length === 0 && <p className="text-sm text-muted">{t('admin.plugins.noPluginsInstalled')}</p>}
      </div>
      <ConfirmDialog
        open={removing !== null}
        title={t('admin.plugins.uninstallPlugin')}
        danger
        confirmLabel={t('admin.plugins.uninstall')}
        loading={uninstall.isPending}
        message={t('admin.plugins.uninstallConfirm', { name: removing?.Name })}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && uninstall.mutate(removing)}
      />
    </>
  );
}

function Catalog() {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('');
  const packages = useQuery({ queryKey: ['admin', 'packages'], queryFn: () => api.get<PackageInfo[]>('/Packages'), staleTime: 5 * 60_000 });
  const installed = useQuery({ queryKey: ['admin', 'plugins'], queryFn: () => api.get<PluginInfo[]>('/Plugins') });
  const installedIds = useMemo(() => new Set((installed.data ?? []).map((p) => p.Id.replace(/-/g, '').toLowerCase())), [installed.data]);

  const install = useMutation({
    mutationFn: (p: PackageInfo) => {
      const v = p.versions[0];
      return api.post(`/Packages/Installed/${encodeURIComponent(p.name)}`, undefined, {
        assemblyGuid: p.guid,
        version: v?.version,
        repositoryUrl: v?.repositoryUrl,
      });
    },
    onSuccess: (_d, p) => {
      toast.success(t('admin.plugins.installingRestart', { name: p.name }));
      void qc.invalidateQueries({ queryKey: ['admin', 'plugins'] });
    },
    onError: (e) => toast.error(e),
  });

  if (packages.isLoading) return <PageSpinner />;
  if (packages.error) return <ErrorState error={packages.error} onRetry={() => packages.refetch()} />;

  const q = filter.trim().toLowerCase();
  const list = (packages.data ?? []).filter(
    (p) => !q || p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q),
  );

  return (
    <>
      <div className="relative max-w-sm">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('admin.plugins.filterPlugins')} className="pl-9" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {list.map((p) => {
          const isInstalled = installedIds.has(p.guid.replace(/-/g, '').toLowerCase());
          return (
            <div key={p.guid} className="flex gap-4 rounded-lg bg-base-800/70 p-4 ring-1 ring-white/5">
              <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded bg-base-750 text-faint">
                {p.imageUrl ? (
                  <Img src={p.imageUrl} className="h-full w-full object-cover" fallback={<Puzzle size={22} />} />
                ) : (
                  <Puzzle size={22} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{p.name}</span>
                  {p.category && <span className="text-xs text-faint">{p.category}</span>}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{p.overview || p.description}</p>
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant={isInstalled ? 'ghost' : 'secondary'}
                    disabled={isInstalled || !p.versions.length}
                    icon={<Download size={14} />}
                    loading={install.isPending && install.variables?.guid === p.guid}
                    onClick={() => install.mutate(p)}
                  >
                    {isInstalled ? t('admin.plugins.installed') : t('admin.plugins.install', { version: p.versions[0]?.version ?? '' })}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** The addresses the catalogue is read from. */
function Repositories() {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['admin', 'repositories'], queryFn: () => api.get<RepositoryInfo[]>('/Repositories') });
  const [draft, setDraft] = useDraft(query.data);
  const save = useMutation({
    mutationFn: (list: RepositoryInfo[]) => api.post('/Repositories', list),
    onSuccess: () => {
      toast.success(t('admin.plugins.repositoriesSaved'));
      void qc.invalidateQueries({ queryKey: ['admin', 'repositories'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'packages'] });
    },
    onError: (e) => toast.error(e),
  });

  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (!draft) return <PageSpinner />;

  const change = (i: number, patch: Partial<RepositoryInfo>) => setDraft(draft.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const complete = draft.every((r) => r.Name?.trim() && /^https?:\/\/\S+$/.test(r.Url?.trim() ?? ''));

  return (
    <div className="space-y-3">
      <p className="max-w-2xl text-sm text-muted">{t('admin.plugins.repositoriesHint')}</p>
      {draft.map((r, i) => (
        <div
          key={i}
          className="grid items-end gap-3 rounded-lg bg-base-800/70 p-4 ring-1 ring-white/5 sm:grid-cols-[1fr_2fr_auto_auto]"
          data-testid="repository"
        >
          <Field label={t('common.name')}>
            <Input value={r.Name ?? ''} onChange={(e) => change(i, { Name: e.target.value })} />
          </Field>
          <Field label={t('admin.plugins.addressOfItsManifest')}>
            <Input
              value={r.Url ?? ''}
              onChange={(e) => change(i, { Url: e.target.value })}
              placeholder="https://…/manifest.json"
              className="font-mono text-xs"
            />
          </Field>
          <Switch label={t('admin.plugins.on')} checked={r.Enabled !== false} onChange={(v) => change(i, { Enabled: v })} />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={r.Name ? t('admin.plugins.removeNamed', { name: r.Name }) : t('admin.plugins.removeRepository')}
            onClick={() => setDraft(draft.filter((_, n) => n !== i))}
          >
            <Trash2 size={16} />
          </Button>
        </div>
      ))}
      {draft.length === 0 && <p className="text-sm text-muted">{t('admin.plugins.noRepositories')}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon={<Plus size={16} />} onClick={() => setDraft([...draft, { Name: '', Url: '', Enabled: true }])}>
          {t('admin.plugins.addRepository')}
        </Button>
        <Button
          variant="primary"
          loading={save.isPending}
          disabled={!complete}
          title={complete ? undefined : t('admin.plugins.repositoryInvalid')}
          onClick={() => save.mutate(draft.map((r) => ({ ...r, Name: r.Name?.trim(), Url: r.Url?.trim() })))}
        >
          {t('admin.plugins.saveRepositories')}
        </Button>
      </div>
    </div>
  );
}

export default function PluginsPage() {
  const [tab, setTab] = useState<'installed' | 'catalog' | 'repositories'>('installed');
  return (
    <AdminPage
      title={t('admin.plugins.plugins')}
      description={t('admin.plugins.description')}
      actions={
        <div className="flex gap-1 rounded-lg bg-base-800/70 p-1 ring-1 ring-white/5">
          {(['installed', 'catalog', 'repositories'] as const).map((option) => (
            <button
              key={option}
              onClick={() => setTab(option)}
              className={clsx(
                'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                tab === option ? 'bg-white/10 text-fg' : 'text-muted hover:text-fg',
              )}
            >
              {t(`admin.plugins.tab.${option}`)}
            </button>
          ))}
        </div>
      }
    >
      {tab === 'installed' ? <Installed /> : tab === 'catalog' ? <Catalog /> : <Repositories />}
    </AdminPage>
  );
}
