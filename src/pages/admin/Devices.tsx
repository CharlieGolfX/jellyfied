import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeviceInfo, ItemsResult } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Modal';
import { PageSpinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { formatRelative } from '@/lib/format';
import { AdminPage, StatusPill } from './shared';

export default function DevicesPage() {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState<DeviceInfo | 'all' | null>(null);
  const devices = useQuery({
    queryKey: ['admin', 'devices'],
    queryFn: () => api.get<ItemsResult<DeviceInfo>>('/Devices'),
  });

  const remove = useMutation({
    mutationFn: async (target: DeviceInfo | 'all') => {
      const list = target === 'all' ? (devices.data?.Items ?? []).filter((d) => d.Id !== api.deviceId) : [target];
      for (const d of list) await api.delete('/Devices', { id: d.Id });
    },
    onSuccess: () => {
      toast.success('Signed out');
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: ['admin', 'devices'] });
    },
    onError: (e) => toast.error(e),
  });

  const items = [...(devices.data?.Items ?? [])].sort(
    (a, b) => new Date(b.DateLastActivated ?? 0).getTime() - new Date(a.DateLastActivated ?? 0).getTime(),
  );

  return (
    <AdminPage
      title="Devices"
      description="Every device that has signed in. Removing a device signs it out."
      actions={
        items.length > 1 && (
          <Button variant="outline" icon={<Trash2 size={16} />} onClick={() => setDeleting('all')}>
            Sign out all others
          </Button>
        )
      }
    >
      {devices.isLoading ? (
        <PageSpinner />
      ) : devices.error ? (
        <ErrorState error={devices.error} onRetry={() => devices.refetch()} />
      ) : (
        <div className="divide-y divide-white/5 overflow-hidden rounded-lg bg-base-800/70 ring-1 ring-white/5">
          {items.map((d) => {
            const isThis = d.Id === api.deviceId;
            return (
              <div key={d.Id} className="flex items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{d.CustomName || d.Name}</span>
                    {isThis && <StatusPill tone="green">This device</StatusPill>}
                  </div>
                  <div className="truncate text-sm text-muted">
                    {d.AppName} {d.AppVersion}
                    {d.LastUserName ? ` · ${d.LastUserName}` : ''}
                  </div>
                </div>
                <span className="hidden shrink-0 text-xs text-faint sm:block">{formatRelative(d.DateLastActivated)}</span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={isThis}
                  onClick={() => setDeleting(d)}
                  aria-label="Remove device"
                  title={isThis ? 'You can’t remove the device you are using' : 'Remove device'}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={deleting !== null}
        title={deleting === 'all' ? 'Sign out all other devices?' : 'Remove device?'}
        message={
          deleting === 'all'
            ? 'Every device except this one will need to sign in again.'
            : `${deleting?.Name ?? 'The device'} will be signed out.`
        }
        confirmLabel="Sign out"
        danger
        loading={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </AdminPage>
  );
}
