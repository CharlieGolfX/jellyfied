import { useQuery } from '@tanstack/react-query';
import { Check, Download } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { BaseItemDto, ItemsResult } from '@/api/types';
import { useApi, useSession } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { formatBytes } from '@/lib/format';
import { t } from '@/i18n';

/** Folders whose files can be downloaded all at once. */
export function canDownloadAll(item: BaseItemDto): boolean {
  return ['Season', 'Series', 'Playlist', 'MusicAlbum', 'BoxSet'].includes(item.Type ?? '');
}

/** Time between two downloads, so the browser takes each one as its own. */
const SPACING_MS = 1500;

/** The files in a folder, in order, that this user may download. */
function useDownloadable(item: BaseItemDto, enabled: boolean) {
  const api = useApi();
  const { userId } = useSession();
  return useQuery({
    queryKey: ['downloadable', item.Id],
    enabled,
    queryFn: async ({ signal }) => {
      const fields = 'CanDownload,MediaSources';
      const result =
        item.Type === 'Playlist'
          ? await api.get<ItemsResult>(`/Playlists/${item.Id}/Items`, { userId, fields, enableImages: false }, signal)
          : await api.get<ItemsResult>(
              '/Items',
              {
                userId,
                parentId: item.Id,
                recursive: true,
                isFolder: false,
                mediaTypes: 'Video,Audio',
                sortBy: 'ParentIndexNumber,IndexNumber,SortName',
                fields,
                enableImages: false,
              },
              signal,
            );
      return result.Items.filter((i) => i.CanDownload);
    },
  });
}

const sizeOf = (item: BaseItemDto) => item.MediaSources?.[0]?.Size ?? 0;

/**
 * Downloads every file in a season, show, album, collection or playlist. A browser can't put
 * them in one archive without holding all of it in memory, so they go one after the other as
 * separate downloads; the browser may ask once whether that is all right.
 */
export function DownloadAllDialog({ item, open, onClose }: { item: BaseItemDto; open: boolean; onClose: () => void }) {
  const api = useApi();
  const files = useDownloadable(item, open);
  const [started, setStarted] = useState(0);
  const [running, setRunning] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const list = files.data ?? [];
  const total = list.reduce((n, f) => n + sizeOf(f), 0);
  const done = running && started >= list.length;

  const start = () => {
    setRunning(true);
    setStarted(0);
    const next = (i: number) => {
      if (i >= list.length) return;
      const a = document.createElement('a');
      a.href = api.url(`/Items/${list[i].Id}/Download`, {}, true);
      a.download = '';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setStarted(i + 1);
      timer.current = window.setTimeout(() => next(i + 1), SPACING_MS);
    };
    next(0);
  };

  const close = () => {
    window.clearTimeout(timer.current);
    setRunning(false);
    setStarted(0);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('media.downloadAll.title', { name: item.Name ?? '' })}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {done ? t('common.close') : t('common.cancel')}
          </Button>
          {!done && (
            <Button variant="primary" icon={<Download size={16} />} onClick={start} disabled={!list.length || running} loading={running}>
              {t('media.downloadAll.start', { count: list.length })}
            </Button>
          )}
        </>
      }
    >
      {files.isLoading ? (
        <div className="flex justify-center py-8 text-accent">
          <Spinner size={24} />
        </div>
      ) : files.error ? (
        <ErrorState error={files.error} onRetry={() => files.refetch()} />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">{t('media.downloadAll.nothing')}</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            {total
              ? t('media.downloadAll.summary', { count: list.length, size: formatBytes(total) })
              : t('media.downloadAll.summaryNoSize', { count: list.length })}{' '}
            {t('media.downloadAll.browserMayAsk')}
          </p>
          <ol className="max-h-72 space-y-1 overflow-y-auto rounded-md bg-base-900/60 p-2 text-sm" data-testid="download-list">
            {list.map((f, i) => (
              <li key={f.Id} className="flex items-center gap-2 px-1 py-0.5">
                <span className="w-5 shrink-0 text-accent">
                  {i < started && <Check size={14} aria-label={t('media.downloadAll.started')} />}
                </span>
                <span className="min-w-0 flex-1 truncate">{f.IndexNumber != null ? `${f.IndexNumber}. ${f.Name}` : f.Name}</span>
                {sizeOf(f) > 0 && <span className="shrink-0 text-xs text-faint tabular-nums">{formatBytes(sizeOf(f))}</span>}
              </li>
            ))}
          </ol>
          {running && (
            <p className="text-sm" role="status">
              {done ? t('media.downloadAll.allStarted') : t('media.downloadAll.progress', { started, count: list.length })}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
