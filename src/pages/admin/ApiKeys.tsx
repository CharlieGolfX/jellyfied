import { Copy, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthenticationInfo, ItemsResult } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageSpinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { formatDateTime } from '@/lib/format';
import { AdminPage } from './shared';
import { t } from '@/i18n';

export default function ApiKeysPage() {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [appName, setAppName] = useState('');
  const [revoking, setRevoking] = useState<AuthenticationInfo | null>(null);
  const keys = useQuery({ queryKey: ['admin', 'apikeys'], queryFn: () => api.get<ItemsResult<AuthenticationInfo>>('/Auth/Keys') });

  const create = useMutation({
    mutationFn: () => api.post('/Auth/Keys', undefined, { app: appName.trim() }),
    onSuccess: () => {
      toast.success(t('admin.apiKeys.apiKeyCreated'));
      setCreating(false);
      setAppName('');
      void qc.invalidateQueries({ queryKey: ['admin', 'apikeys'] });
    },
    onError: (e) => toast.error(e),
  });
  const revoke = useMutation({
    mutationFn: (k: AuthenticationInfo) => api.delete(`/Auth/Keys/${k.AccessToken}`),
    onSuccess: () => {
      toast.success(t('admin.apiKeys.apiKeyRevoked'));
      setRevoking(null);
      void qc.invalidateQueries({ queryKey: ['admin', 'apikeys'] });
    },
    onError: (e) => toast.error(e),
  });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('admin.apiKeys.copiedToClipboard'));
    } catch {
      toast.error(t('admin.apiKeys.clipboardIsNotAvailableOn'));
    }
  };

  return (
    <AdminPage
      title={t('admin.apiKeys.apiKeys')}
      description={t('admin.apiKeys.keysLetExternalApplicationsLike')}
      actions={
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>
          {t('admin.apiKeys.newApiKey')}
        </Button>
      }
    >
      {keys.isLoading ? (
        <PageSpinner />
      ) : keys.error ? (
        <ErrorState error={keys.error} onRetry={() => keys.refetch()} />
      ) : (
        <div className="divide-y divide-white/5 overflow-hidden rounded-lg bg-base-800/70 ring-1 ring-white/5">
          {keys.data!.Items.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">{t('admin.apiKeys.noApiKeysYet')}</p>}
          {keys.data!.Items.map((k) => (
            <div key={k.AccessToken} className="flex flex-wrap items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{k.AppName}</div>
                <div className="text-xs text-faint">
                  {t('admin.apiKeys.created')} {formatDateTime(k.DateCreated)}
                </div>
              </div>
              <code className="rounded bg-black/30 px-2 py-1 font-mono text-xs break-all text-fg/85 select-all">{k.AccessToken}</code>
              <div className="flex gap-1">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => copy(k.AccessToken)}
                  aria-label={t('admin.apiKeys.copyKey')}
                  title={t('admin.apiKeys.copy')}
                >
                  <Copy size={15} />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setRevoking(k)}
                  aria-label={t('admin.apiKeys.revokeKey')}
                  title={t('admin.apiKeys.revoke')}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={t('admin.apiKeys.newApiKey')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" loading={create.isPending} disabled={!appName.trim()} onClick={() => create.mutate()}>
              {t('common.create')}
            </Button>
          </>
        }
      >
        <Field label={t('admin.apiKeys.appName')} hint={t('admin.apiKeys.aLabelSoYouRemember')}>
          <Input autoFocus value={appName} onChange={(e) => setAppName(e.target.value)} placeholder={t('admin.apiKeys.sonarr')} />
        </Field>
      </Modal>
      <ConfirmDialog
        open={revoking !== null}
        title={t('admin.apiKeys.revokeApiKey')}
        danger
        confirmLabel={t('admin.apiKeys.revoke')}
        loading={revoke.isPending}
        message={t('admin.apiKeys.applicationsUsingTheKeyWill', { appName: revoking?.AppName })}
        onClose={() => setRevoking(null)}
        onConfirm={() => revoking && revoke.mutate(revoking)}
      />
    </AdminPage>
  );
}
