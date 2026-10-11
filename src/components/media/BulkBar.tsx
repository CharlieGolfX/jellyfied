import { CheckCircle, Circle, FolderPlus, ListChecks, ListPlus, Trash2, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MEDIA } from '@/api/queries';
import type { BaseItemDto } from '@/api/types';
import { useApi, useCurrentUser, useSession } from '@/auth/AuthProvider';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { plural } from '@/lib/format';
import { supportsWatchedState } from '@/player/usePlay';
import { AddToCollectionDialog, supportsCollections, useCanManageCollections } from './AddToCollection';
import { AddToPlaylistDialog, supportsPlaylists } from './Playlists';
import { useSelectedItems, useSelection } from './selection';

function BarButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={
        'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-white/10 disabled:opacity-40 ' +
        (danger ? 'text-danger' : 'text-fg')
      }
    >
      {children}
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}

/** How many of a batch of requests went through. */
export function countSettled(results: PromiseSettledResult<unknown>[]): { done: number; failed: number } {
  const failed = results.filter((r) => r.status === 'rejected').length;
  return { done: results.length - failed, failed };
}

/**
 * Floats over the page while items are selected, with the actions that apply to all of them.
 * `allItems` are the items currently loaded, for "Select all".
 */
export function BulkBar({ allItems }: { allItems: BaseItemDto[] }) {
  const api = useApi();
  const { userId } = useSession();
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const toast = useToast();
  const selection = useSelection();
  const items = useSelectedItems();
  const canManageCollections = useCanManageCollections();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<'playlist' | 'collection' | 'delete' | null>(null);

  if (!selection || items.length === 0) return null;

  const canDelete = Boolean(user?.Policy?.IsAdministrator || user?.Policy?.EnableContentDeletion);
  const watchable = items.filter(supportsWatchedState);
  const playlistable = items.every(supportsPlaylists);
  const collectable = canManageCollections && items.every(supportsCollections);

  /** Runs one request per item and reports how it went. */
  const forEach = async (targets: BaseItemDto[], action: (item: BaseItemDto) => Promise<unknown>, done: string) => {
    setBusy(true);
    const result = countSettled(await Promise.allSettled(targets.map(action)));
    setBusy(false);
    void qc.invalidateQueries({ queryKey: [MEDIA] });
    if (result.failed) toast.error(`${plural(result.failed, 'item')} could not be changed.`);
    if (result.done) toast.success(`${plural(result.done, 'item')} ${done}`);
    selection.clear();
  };

  const setPlayed = (played: boolean) =>
    forEach(
      watchable,
      (item) =>
        played ? api.post(`/UserPlayedItems/${item.Id}`, undefined, { userId }) : api.delete(`/UserPlayedItems/${item.Id}`, { userId }),
      played ? 'marked as watched' : 'marked as unwatched',
    );

  return (
    <>
      <div
        role="toolbar"
        aria-label="Actions for the selected items"
        data-testid="bulk-bar"
        className="animate-pop-in fixed bottom-24 left-1/2 z-40 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-1 rounded-lg bg-base-750 px-2 py-1.5 shadow-2xl ring-1 ring-white/15"
      >
        <span className="px-2 text-sm font-semibold whitespace-nowrap text-accent">{items.length} selected</span>
        {watchable.length > 0 && (
          <>
            <BarButton label="Watched" onClick={() => void setPlayed(true)} disabled={busy}>
              <CheckCircle size={17} />
            </BarButton>
            <BarButton label="Unwatched" onClick={() => void setPlayed(false)} disabled={busy}>
              <Circle size={17} />
            </BarButton>
          </>
        )}
        {playlistable && (
          <BarButton label="Add to playlist" onClick={() => setDialog('playlist')} disabled={busy}>
            <ListPlus size={17} />
          </BarButton>
        )}
        {collectable && (
          <BarButton label="Add to collection" onClick={() => setDialog('collection')} disabled={busy}>
            <FolderPlus size={17} />
          </BarButton>
        )}
        {canDelete && (
          <BarButton label="Delete" onClick={() => setDialog('delete')} disabled={busy} danger>
            <Trash2 size={17} />
          </BarButton>
        )}
        <span className="mx-1 h-5 w-px bg-white/15" />
        <BarButton label="Select all" onClick={() => selection.add(allItems)} disabled={busy || items.length >= allItems.length}>
          <ListChecks size={17} />
        </BarButton>
        <button
          onClick={() => selection.clear()}
          className="rounded-full p-1.5 text-muted hover:bg-white/10 hover:text-fg"
          aria-label="Clear selection"
        >
          <X size={17} />
        </button>
      </div>

      {dialog === 'playlist' && <AddToPlaylistDialog item={items} onClose={() => setDialog(null)} />}
      {dialog === 'collection' && <AddToCollectionDialog item={items} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog === 'delete'}
        title={`Delete ${plural(items.length, 'item')}?`}
        message={
          <>
            This deletes the files from the server’s disk and can’t be undone:
            <span className="mt-2 block max-h-32 overflow-y-auto text-fg">
              {items.slice(0, 30).map((i) => (
                <span key={i.Id} className="block truncate">
                  {i.Name}
                </span>
              ))}
              {items.length > 30 && <span className="block text-muted">…and {items.length - 30} more</span>}
            </span>
          </>
        }
        confirmLabel="Delete"
        danger
        loading={busy}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          void forEach(items, (item) => api.delete(`/Items/${item.Id}`), 'deleted');
        }}
      />
    </>
  );
}
