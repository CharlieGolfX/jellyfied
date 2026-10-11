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
import { t } from '@/i18n';

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
      toast.success(t('admin.devices.signedOut'));
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: ['admin', 'devices'] });
    },
    onError: (e) => toast.error(e),
  });

  const items = [...(devices.data?.Items ?? [])].sort(
    (a, b) => new Date(b.DateLastActivity ?? 0).getTime() - new Date(a.DateLastActivity ?? 0).getTime(),
  );

  return (
    <AdminPage
      title={t('admin.devices.devices')}
      description={t('admin.devices.everyDeviceThatHasSigned')}
      actions={
        items.length > 1 && (
          <Button variant="outline" icon={<Trash2 size={16} />} onClick={() => setDeleting('all')}>
            {t('admin.devices.signOutAllOthers')}
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
                    {isThis && <StatusPill tone="green">{t('common.thisDevice')}</StatusPill>}
                  </div>
                  <div className="truncate text-sm text-muted">
                    {d.AppName} {d.AppVersion}
                    {d.LastUserName ? ` · ${d.LastUserName}` : ''}
                  </div>
                </div>
                <span className="hidden shrink-0 text-xs text-faint sm:block">{formatRelative(d.DateLastActivity)}</span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={isThis}
                  onClick={() => setDeleting(d)}
                  aria-label={t('admin.devices.removeDevice')}
                  title={isThis ? t('admin.devices.youCanTRemoveThe') : t('admin.devices.removeDevice')}
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
        title={deleting === 'all' ? t('admin.devices.signOutAllOtherDevices') : t('admin.devices.removeDevice2')}
        message={
          deleting === 'all'
            ? t('admin.devices.everyDeviceExceptThisOne')
            : t('admin.devices.willBeSignedOut', { name: deleting?.Name ?? t('admin.devices.theDevice') })
        }
        confirmLabel={t('admin.devices.signOut')}
        danger
        loading={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </AdminPage>
  );
}
