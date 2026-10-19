import { useState } from 'react';
import type { NetworkConfiguration } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Field, Input, Switch, TextArea } from '@/components/ui/Form';
import { PageSpinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { Card } from '@/components/ui/Card';
import { AdminPage, parseList, useConfigEditor } from './shared';
import { t } from '@/i18n';

export default function NetworkPage() {
  const { query, save } = useConfigEditor<NetworkConfiguration>('/System/Configuration/network', t('admin.network.networkSettings'));
  const [draft, setDraft] = useState<NetworkConfiguration | null>(null);
  const [lists, setLists] = useState({ subnets: '', addresses: '', proxies: '', filter: '' });

  // The form starts over from whatever the server has, each time that is loaded.
  const [loaded, setLoaded] = useState<NetworkConfiguration | undefined>(undefined);
  if (query.data && query.data !== loaded) {
    setLoaded(query.data);
    setDraft(query.data);
    setLists({
      subnets: (query.data.LocalNetworkSubnets ?? []).join('\n'),
      addresses: (query.data.LocalNetworkAddresses ?? []).join('\n'),
      proxies: (query.data.KnownProxies ?? []).join('\n'),
      filter: (query.data.RemoteIPFilter ?? []).join('\n'),
    });
  }

  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (!draft) return <PageSpinner />;

  const set = <K extends keyof NetworkConfiguration>(k: K, v: NetworkConfiguration[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const port = (v: string, fallback: number) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 && n < 65536 ? n : fallback;
  };

  const submit = () =>
    save.mutate({
      ...draft,
      LocalNetworkSubnets: parseList(lists.subnets),
      LocalNetworkAddresses: parseList(lists.addresses),
      KnownProxies: parseList(lists.proxies),
      RemoteIPFilter: parseList(lists.filter),
    });

  return (
    <AdminPage
      title={t('admin.network.networking')}
      description={t('admin.network.changesToPortsBaseUrl')}
      actions={
        <Button variant="primary" loading={save.isPending} onClick={submit}>
          {t('common.saveChanges')}
        </Button>
      }
    >
      <Card title={t('admin.network.serverAddress')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('admin.network.baseUrl')} hint={t('admin.network.baseUrlHint')}>
            <Input className="font-mono" value={draft.BaseUrl ?? ''} onChange={(e) => set('BaseUrl', e.target.value)} />
          </Field>
          <div />
          <Field label={t('admin.network.localHttpPort')}>
            <Input
              type="number"
              value={draft.InternalHttpPort}
              onChange={(e) => set('InternalHttpPort', port(e.target.value, draft.InternalHttpPort))}
            />
          </Field>
          <Field label={t('admin.network.localHttpsPort')}>
            <Input
              type="number"
              value={draft.InternalHttpsPort}
              onChange={(e) => set('InternalHttpsPort', port(e.target.value, draft.InternalHttpsPort))}
            />
          </Field>
          <Field label={t('admin.network.publicHttpPort')}>
            <Input
              type="number"
              value={draft.PublicHttpPort}
              onChange={(e) => set('PublicHttpPort', port(e.target.value, draft.PublicHttpPort))}
            />
          </Field>
          <Field label={t('admin.network.publicHttpsPort')}>
            <Input
              type="number"
              value={draft.PublicHttpsPort}
              onChange={(e) => set('PublicHttpsPort', port(e.target.value, draft.PublicHttpsPort))}
            />
          </Field>
        </div>
        <div className="mt-3 divide-y divide-white/5">
          <Switch label={t('admin.network.enableHttps')} checked={draft.EnableHttps} onChange={(v) => set('EnableHttps', v)} />
          <Switch label={t('admin.network.requireHttps')} checked={draft.RequireHttps} onChange={(v) => set('RequireHttps', v)} />
        </div>
      </Card>

      <Card title={t('admin.network.access')}>
        <div className="divide-y divide-white/5">
          <Switch
            label={t('admin.network.allowRemoteConnections')}
            checked={draft.EnableRemoteAccess}
            onChange={(v) => set('EnableRemoteAccess', v)}
          />
          <Switch label={t('admin.network.enableAutoDiscovery')} checked={draft.AutoDiscovery} onChange={(v) => set('AutoDiscovery', v)} />
          <Switch label={t('admin.network.enableIpv4')} checked={draft.EnableIPv4} onChange={(v) => set('EnableIPv4', v)} />
          <Switch label={t('admin.network.enableIpv6')} checked={draft.EnableIPv6} onChange={(v) => set('EnableIPv6', v)} />
          {'EnableUPnP' in draft && (
            <Switch label={t('admin.network.enableUpnp')} checked={draft.EnableUPnP} onChange={(v) => set('EnableUPnP', v)} />
          )}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={t('admin.network.lanNetworks')} hint={t('admin.network.oneCidrPerLineE')}>
            <TextArea className="font-mono" value={lists.subnets} onChange={(e) => setLists((l) => ({ ...l, subnets: e.target.value }))} />
          </Field>
          <Field label={t('admin.network.bindToLocalAddresses')} hint={t('admin.network.onePerLineEmptyAll')}>
            <TextArea
              className="font-mono"
              value={lists.addresses}
              onChange={(e) => setLists((l) => ({ ...l, addresses: e.target.value }))}
            />
          </Field>
          <Field label={t('admin.network.knownProxies')} hint={t('admin.network.knownProxiesHint')}>
            <TextArea className="font-mono" value={lists.proxies} onChange={(e) => setLists((l) => ({ ...l, proxies: e.target.value }))} />
          </Field>
          <Field label={t('admin.network.remoteIpFilter')} hint={t('admin.network.onePerLine')}>
            <TextArea className="font-mono" value={lists.filter} onChange={(e) => setLists((l) => ({ ...l, filter: e.target.value }))} />
          </Field>
        </div>
        <div className="mt-2">
          <Switch
            label={t('admin.network.filterIsBlocklist')}
            description={t('admin.network.filterIsBlocklistHint')}
            checked={draft.IsRemoteIPFilterBlacklist}
            onChange={(v) => set('IsRemoteIPFilterBlacklist', v)}
          />
        </div>
      </Card>
    </AdminPage>
  );
}
