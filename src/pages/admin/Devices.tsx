import { Trash2, UserX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeviceInfo, ItemsResult } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
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
  const [deleting, setDeleting] = useState<DeviceInfo | 'all' | UserDevices | null>(null);
  const [pickingUser, setPickingUser] = useState(false);
  const devices = useQuery({
    queryKey: ['admin', 'devices'],
    queryFn: () => api.get<ItemsResult<DeviceInfo>>('/Devices'),
  });

  const remove = useMutation({
    mutationFn: async (target: DeviceInfo | 'all' | UserDevices) => {
      const list =
        target === 'all'
          ? (devices.data?.Items ?? []).filter((d) => d.Id !== api.deviceId)
          : isUserDevices(target)
            ? target.devices.filter((d) => d.Id !== api.deviceId)
            : [target];
      // Removing a device also ends the sessions on it.
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
  const users = useMemo(() => devicesByUser(items, api.deviceId), [items, api.deviceId]);

  return (
    <AdminPage
      title={t('admin.devices.devices')}
      description={t('admin.devices.everyDeviceThatHasSigned')}
      actions={
        <>
          {users.some((u) => u.removable > 0) && (
            <Button variant="outline" icon={<UserX size={16} />} onClick={() => setPickingUser(true)}>
              {t('admin.devices.signOutUser')}
            </Button>
          )}
          {items.length > 1 && (
            <Button variant="outline" icon={<Trash2 size={16} />} onClick={() => setDeleting('all')}>
              {t('admin.devices.signOutAllOthers')}
            </Button>
          )}
        </>
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
                  title={isThis ? t('admin.devices.cannotRemoveCurrent') : t('admin.devices.removeDevice')}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            );
          })}
        </div>
      )}
      <Modal open={pickingUser} onClose={() => setPickingUser(false)} title={t('admin.devices.signOutUserTitle')} size="sm">
        <p className="mb-3 text-sm text-muted">{t('admin.devices.signOutUserHint')}</p>
        <div className="-mx-2">
          {users.map((u) => (
            <button
              key={u.userId}
              disabled={u.removable === 0}
              onClick={() => {
                setPickingUser(false);
                setDeleting(u);
              }}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-white/10 disabled:opacity-50 disabled:hover:bg-transparent"
            >
              <span className="min-w-0 flex-1 truncate font-medium">{u.name}</span>
              <span className="shrink-0 text-xs text-muted">{t('admin.devices.deviceCount', { count: u.devices.length })}</span>
            </button>
          ))}
        </div>
      </Modal>
      <ConfirmDialog
        open={deleting !== null}
        title={
          deleting === 'all'
            ? t('admin.devices.signOutAllOtherDevices')
            : isUserDevices(deleting)
              ? t('admin.devices.signOutUserEverywhere', { name: deleting.name })
              : t('admin.devices.removeDeviceTitle')
        }
        message={
          deleting === 'all'
            ? t('admin.devices.everyDeviceExceptThisOne')
            : isUserDevices(deleting)
              ? deleting.removable < deleting.devices.length
                ? t('admin.devices.yourOtherDevicesSignedOut', { count: deleting.removable })
                : t('admin.devices.userDevicesSignedOut', { name: deleting.name, count: deleting.removable })
              : t('admin.devices.willBeSignedOut', { name: deleting?.Name ?? t('admin.devices.deviceFallback') })
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

/** One user's devices: whoever signed in on them last, which is who their sign-in belongs to. */
interface UserDevices {
  userId: string;
  name: string;
  devices: DeviceInfo[];
  /** How many of them can be signed out: all, except the device this page is open on. */
  removable: number;
}

const isUserDevices = (v: DeviceInfo | 'all' | UserDevices | null): v is UserDevices =>
  typeof v === 'object' && v !== null && 'devices' in v;

export function devicesByUser(devices: DeviceInfo[], thisDevice: string): UserDevices[] {
  const users = new Map<string, UserDevices>();
  for (const d of devices) {
    if (!d.LastUserId) continue;
    const user = users.get(d.LastUserId) ?? { userId: d.LastUserId, name: d.LastUserName || d.LastUserId, devices: [], removable: 0 };
    user.devices.push(d);
    if (d.Id !== thisDevice) user.removable++;
    users.set(d.LastUserId, user);
  }
  return [...users.values()].sort((a, b) => a.name.localeCompare(b.name));
}
