import { useEffect, useState } from 'react';
import type { NetworkConfiguration } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Field, Input, Switch, TextArea } from '@/components/ui/Form';
import { PageSpinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { Card } from '@/pages/Settings';
import { AdminPage, parseList, useConfigEditor } from './shared';

export default function NetworkPage() {
  const { query, save } = useConfigEditor<NetworkConfiguration>('/System/Configuration/network', 'Network settings');
  const [draft, setDraft] = useState<NetworkConfiguration | null>(null);
  const [lists, setLists] = useState({ subnets: '', addresses: '', proxies: '', filter: '' });

  useEffect(() => {
    if (!query.data) return;
    setDraft(query.data);
    setLists({
      subnets: (query.data.LocalNetworkSubnets ?? []).join('\n'),
      addresses: (query.data.LocalNetworkAddresses ?? []).join('\n'),
      proxies: (query.data.KnownProxies ?? []).join('\n'),
      filter: (query.data.RemoteIPFilter ?? []).join('\n'),
    });
  }, [query.data]);

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
      title="Networking"
      description="Changes to ports, base URL or HTTPS take effect after a server restart. Be careful: wrong values can make the server unreachable."
      actions={
        <Button variant="primary" loading={save.isPending} onClick={submit}>
          Save changes
        </Button>
      }
    >
      <Card title="Server address">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Base URL" hint="e.g. /jellyfin when serving from a sub-path.">
            <Input className="font-mono" value={draft.BaseUrl ?? ''} onChange={(e) => set('BaseUrl', e.target.value)} />
          </Field>
          <div />
          <Field label="Local HTTP port">
            <Input type="number" value={draft.InternalHttpPort} onChange={(e) => set('InternalHttpPort', port(e.target.value, draft.InternalHttpPort))} />
          </Field>
          <Field label="Local HTTPS port">
            <Input type="number" value={draft.InternalHttpsPort} onChange={(e) => set('InternalHttpsPort', port(e.target.value, draft.InternalHttpsPort))} />
          </Field>
          <Field label="Public HTTP port">
            <Input type="number" value={draft.PublicHttpPort} onChange={(e) => set('PublicHttpPort', port(e.target.value, draft.PublicHttpPort))} />
          </Field>
          <Field label="Public HTTPS port">
            <Input type="number" value={draft.PublicHttpsPort} onChange={(e) => set('PublicHttpsPort', port(e.target.value, draft.PublicHttpsPort))} />
          </Field>
        </div>
        <div className="mt-3 divide-y divide-white/5">
          <Switch label="Enable HTTPS" checked={draft.EnableHttps} onChange={(v) => set('EnableHttps', v)} />
          <Switch label="Require HTTPS" checked={draft.RequireHttps} onChange={(v) => set('RequireHttps', v)} />
        </div>
      </Card>

      <Card title="Access">
        <div className="divide-y divide-white/5">
          <Switch label="Allow remote connections" checked={draft.EnableRemoteAccess} onChange={(v) => set('EnableRemoteAccess', v)} />
          <Switch label="Enable auto-discovery" checked={draft.AutoDiscovery} onChange={(v) => set('AutoDiscovery', v)} />
          <Switch label="Enable IPv4" checked={draft.EnableIPv4} onChange={(v) => set('EnableIPv4', v)} />
          <Switch label="Enable IPv6" checked={draft.EnableIPv6} onChange={(v) => set('EnableIPv6', v)} />
          {'EnableUPnP' in draft && (
            <Switch label="Enable automatic port mapping (UPnP)" checked={draft.EnableUPnP} onChange={(v) => set('EnableUPnP', v)} />
          )}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="LAN networks" hint="One CIDR per line, e.g. 192.168.1.0/24">
            <TextArea className="font-mono" value={lists.subnets} onChange={(e) => setLists((l) => ({ ...l, subnets: e.target.value }))} />
          </Field>
          <Field label="Bind to local addresses" hint="One per line. Empty = all interfaces.">
            <TextArea className="font-mono" value={lists.addresses} onChange={(e) => setLists((l) => ({ ...l, addresses: e.target.value }))} />
          </Field>
          <Field label="Known proxies" hint="Reverse proxies whose X-Forwarded-For header is trusted.">
            <TextArea className="font-mono" value={lists.proxies} onChange={(e) => setLists((l) => ({ ...l, proxies: e.target.value }))} />
          </Field>
          <Field label="Remote IP filter" hint="One per line.">
            <TextArea className="font-mono" value={lists.filter} onChange={(e) => setLists((l) => ({ ...l, filter: e.target.value }))} />
          </Field>
        </div>
        <div className="mt-2">
          <Switch
            label="Remote IP filter is a blocklist"
            description="When off, the filter is an allowlist."
            checked={draft.IsRemoteIPFilterBlacklist}
            onChange={(v) => set('IsRemoteIPFilterBlacklist', v)}
          />
        </div>
      </Card>
    </AdminPage>
  );
}
