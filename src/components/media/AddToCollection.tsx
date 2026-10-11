import { FolderPlus, Plus } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MEDIA } from '@/api/queries';
import type { BaseItemDto, ItemsResult } from '@/api/types';
import { useApi, useCurrentUser, useSession } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { t } from '@/i18n';
import { plural } from '@/lib/format';

const COLLECTABLE = new Set(['Movie', 'Series', 'Video', 'MusicVideo']);

/** Collections can be managed by administrators and by users who were given that permission. */
export function useCanManageCollections(): boolean {
  const { data } = useCurrentUser();
  return Boolean(data?.Policy?.IsAdministrator || data?.Policy?.EnableCollectionManagement);
}

export function supportsCollections(item: BaseItemDto): boolean {
  return COLLECTABLE.has(item.Type);
}

export function useRemoveFromCollection() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ collectionId, itemId }: { collectionId: string; itemId: string }) =>
      api.delete(`/Collections/${collectionId}/Items`, { ids: itemId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [MEDIA] }),
  });
}

/** Dialog to add an item (or several) to an existing collection, or to a new one. */
export function AddToCollectionDialog({ item, onClose }: { item: BaseItemDto | BaseItemDto[]; onClose: () => void }) {
  const items = Array.isArray(item) ? item : [item];
  const ids = items.map((i) => i.Id);
  const api = useApi();
  const { userId } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');

  const collections = useQuery({
    queryKey: [MEDIA, 'collections-picker'],
    queryFn: () =>
      api.get<ItemsResult>('/Items', {
        userId,
        includeItemTypes: 'BoxSet',
        recursive: true,
        sortBy: 'SortName',
        fields: 'ChildCount',
        enableImages: false,
      }),
  });

  const done = (collectionName: string) => {
    void qc.invalidateQueries({ queryKey: [MEDIA] });
    toast.success(t('media.addToCollection.addedTo', { collectionName }));
    onClose();
  };

  const add = useMutation({
    mutationFn: (collection: BaseItemDto) => api.post(`/Collections/${collection.Id}/Items`, undefined, { ids }),
    onSuccess: (_r, collection) => done(collection.Name ?? 'collection'),
    onError: (e) => toast.error(e),
  });

  const create = useMutation({
    mutationFn: (collectionName: string) => api.post('/Collections', undefined, { name: collectionName, ids }),
    onSuccess: (_r, collectionName) => done(collectionName),
    onError: (e) => toast.error(e),
  });

  const list = collections.data?.Items ?? [];
  const busy = add.isPending || create.isPending;

  return (
    <Modal open onClose={onClose} title={t('common.addToCollection')} size="sm">
      <p className="mb-3 truncate text-sm text-muted">{items.length === 1 ? items[0].Name : plural(items.length, 'item')}</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate(name.trim());
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('media.addToCollection.newCollectionName')}
          aria-label={t('media.addToCollection.newCollectionName')}
          maxLength={200}
        />
        <Button type="submit" variant="primary" icon={<Plus size={16} />} disabled={!name.trim() || busy} loading={create.isPending}>
          {t('common.create')}
        </Button>
      </form>

      <div className="mt-4 -mx-2 max-h-72 overflow-y-auto">
        {collections.isLoading ? (
          <div className="flex justify-center py-6 text-accent">
            <Spinner size={24} />
          </div>
        ) : list.length === 0 ? (
          <p className="px-2 py-4 text-sm text-faint">{t('media.addToCollection.thereAreNoCollectionsYet')}</p>
        ) : (
          list.map((c) => (
            <button
              key={c.Id}
              disabled={busy}
              onClick={() => add.mutate(c)}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-white/10 disabled:opacity-50"
            >
              <FolderPlus size={16} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate">{c.Name}</span>
              {c.ChildCount ? <span className="shrink-0 text-xs text-faint">{c.ChildCount}</span> : null}
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
