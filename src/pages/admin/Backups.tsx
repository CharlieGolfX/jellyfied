import { DatabaseBackup, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BackupManifestDto, BackupOptionsDto } from '@/api/generated';
import { useApi } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Form';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageSpinner } from '@/components/ui/Spinner';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { formatDateTime } from '@/lib/format';
import { AdminPage, StatusPill } from './shared';
import { t, tRich } from '@/i18n';

/** What a backup holds besides the database, which is always part of it. */
const PARTS: { key: keyof BackupOptionsDto; label: string; description: string }[] = [
  { key: 'Metadata', label: t('common.metadata'), description: t('admin.backups.metadataHint') },
  { key: 'Subtitles', label: t('common.subtitles'), description: t('admin.backups.subtitlesHint') },
  {
    key: 'Trickplay',
    label: t('admin.backups.trickplayImages'),
    description: t('admin.backups.trickplayHint'),
  },
];

const fileName = (path?: string) => path?.split(/[\\/]/).pop() ?? '';

export default function BackupsPage() {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [options, setOptions] = useState<BackupOptionsDto>({ Metadata: false, Subtitles: false, Trickplay: false });
  const [restoring, setRestoring] = useState<BackupManifestDto | null>(null);

  const backups = useQuery({ queryKey: ['admin', 'backups'], queryFn: () => api.get<BackupManifestDto[]>('/Backup') });

  const create = useMutation({
    mutationFn: () => api.post<BackupManifestDto>('/Backup/Create', { ...options, Database: true }),
    onSuccess: () => {
      toast.success(t('admin.backups.backupCreated'));
      setCreating(false);
      void qc.invalidateQueries({ queryKey: ['admin', 'backups'] });
    },
    onError: (e) => toast.error(e),
  });
  const restore = useMutation({
    mutationFn: (backup: BackupManifestDto) => api.post('/Backup/Restore', { ArchiveFileName: fileName(backup.Path) }),
    onSuccess: () => {
      toast.success(t('admin.backups.restoring'));
      setRestoring(null);
    },
    onError: (e) => toast.error(e),
  });

  const list = [...(backups.data ?? [])].sort((a, b) => (b.DateCreated ?? '').localeCompare(a.DateCreated ?? ''));

  return (
    <AdminPage
      title={t('admin.backups.backups')}
      description={t('admin.backups.copiesOfTheServerS')}
      actions={
        <Button variant="primary" icon={<DatabaseBackup size={16} />} onClick={() => setCreating(true)}>
          {t('admin.backups.createBackup')}
        </Button>
      }
    >
      {backups.isLoading ? (
        <PageSpinner />
      ) : backups.error ? (
        <ErrorState error={backups.error} onRetry={() => backups.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState title={t('admin.backups.noBackupsYet')}>{t('admin.backups.emptyHint')}</EmptyState>
      ) : (
        <ul className="space-y-3">
          {list.map((b) => (
            <li
              key={b.Path}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-base-800/70 p-4 ring-1 ring-white/5"
              data-testid="backup"
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{b.DateCreated ? formatDateTime(b.DateCreated) : fileName(b.Path)}</div>
                <div className="mt-0.5 truncate font-mono text-xs text-faint" title={b.Path}>
                  {b.Path}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusPill tone="blue">{t('admin.backups.database')}</StatusPill>
                  {PARTS.filter((p) => b.Options?.[p.key]).map((p) => (
                    <StatusPill key={p.key} tone="gray">
                      {p.label}
                    </StatusPill>
                  ))}
                  {b.ServerVersion && (
                    <span className="text-xs text-faint">
                      {t('admin.backups.jellyfin')} {b.ServerVersion}
                    </span>
                  )}
                </div>
              </div>
              <Button variant="outline" size="sm" icon={<RotateCcw size={14} />} onClick={() => setRestoring(b)}>
                {t('admin.backups.restore')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={t('admin.backups.createBackup')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" loading={create.isPending} onClick={() => create.mutate()}>
              {t('admin.backups.createBackup')}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted">{t('admin.backups.createHint')}</p>
        {PARTS.map((p) => (
          <div key={p.key} className="py-1">
            <Checkbox label={p.label} checked={Boolean(options[p.key])} onChange={(v) => setOptions((o) => ({ ...o, [p.key]: v }))} />
            <p className="ml-7 text-xs text-faint">{p.description}</p>
          </div>
        ))}
      </Modal>

      <ConfirmDialog
        open={restoring !== null}
        title={t('admin.backups.restoreBackup')}
        danger
        confirmLabel={t('admin.backups.restoreAndRestart')}
        loading={restore.isPending}
        message={
          <>
            {tRich('admin.backups.restoreConfirm', {
              date: <strong className="text-fg">{restoring?.DateCreated ? formatDateTime(restoring.DateCreated) : ''}</strong>,
            })}
          </>
        }
        onClose={() => setRestoring(null)}
        onConfirm={() => restoring && restore.mutate(restoring)}
      />
    </AdminPage>
  );
}
