import { ListMusic, Plus } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MEDIA } from '@/api/queries';
import type { BaseItemDto, ItemsResult } from '@/api/types';
import { useApi, useSession } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Field, Input, Switch } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { t } from '@/i18n';
import { plural } from '@/lib/format';

const AUDIO_TYPES = new Set(['Audio', 'MusicAlbum', 'MusicArtist', 'MusicGenre', 'AudioBook']);
const VIDEO_TYPES = new Set(['Movie', 'Episode', 'Series', 'Season', 'Video', 'MusicVideo', 'BoxSet']);

/** Things that can be put in a playlist. Albums, shows and other containers are added item by item by the server. */
export function supportsPlaylists(item: BaseItemDto): boolean {
  return AUDIO_TYPES.has(item.Type) || VIDEO_TYPES.has(item.Type);
}

interface PlaylistAccess {
  OpenAccess: boolean;
}

/** Whether the playlist is visible to all users. */
export function usePlaylistAccess(playlistId: string, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: [MEDIA, 'playlist-access', playlistId],
    queryFn: () => api.get<PlaylistAccess>(`/Playlists/${playlistId}`),
    enabled,
  });
}

/** Whether the current user may change the playlist: its owner, or someone it was shared with for editing. */
export function useCanEditPlaylist(playlistId: string): boolean {
  const api = useApi();
  const { userId } = useSession();
  const { data } = useQuery({
    queryKey: [MEDIA, 'playlist-can-edit', playlistId, userId],
    queryFn: async () => {
      try {
        return (await api.get<{ CanEdit: boolean }>(`/Playlists/${playlistId}/Users/${userId}`)).CanEdit;
      } catch {
        // The server answers with an error for playlists of other users that weren't shared.
        return false;
      }
    },
  });
  return data ?? false;
}

export function useRemoveFromPlaylist(playlistId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => api.delete(`/Playlists/${playlistId}/Items`, { entryIds: entryId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [MEDIA] }),
  });
}

export function useMovePlaylistItem(playlistId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, index }: { entryId: string; index: number }) =>
      api.post(`/Playlists/${playlistId}/Items/${entryId}/Move/${index}`),
    onSettled: () => qc.invalidateQueries({ queryKey: [MEDIA, 'playlist', playlistId] }),
  });
}

/** Dialog to add an item to an existing playlist, or to a new one. */
/** `item` may be several items, which are then all added. */
export function AddToPlaylistDialog({ item, onClose }: { item: BaseItemDto | BaseItemDto[]; onClose: () => void }) {
  const items = Array.isArray(item) ? item : [item];
  const ids = items.map((i) => i.Id);
  const api = useApi();
  const { userId } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');

  const playlists = useQuery({
    queryKey: [MEDIA, 'playlists-picker'],
    queryFn: () =>
      api.get<ItemsResult>('/Items', {
        userId,
        includeItemTypes: 'Playlist',
        recursive: true,
        sortBy: 'SortName',
        fields: 'ChildCount',
        enableImages: false,
      }),
  });

  const done = (playlistName: string) => {
    void qc.invalidateQueries({ queryKey: [MEDIA] });
    toast.success(t('media.playlists.addedTo', { playlistName }));
    onClose();
  };

  const add = useMutation({
    mutationFn: (playlist: BaseItemDto) => api.post(`/Playlists/${playlist.Id}/Items`, undefined, { ids, userId }),
    onSuccess: (_r, playlist) => done(playlist.Name ?? 'playlist'),
    onError: (e) => toast.error(e),
  });

  const create = useMutation({
    mutationFn: (playlistName: string) =>
      api.post('/Playlists', {
        Name: playlistName,
        Ids: ids,
        UserId: userId,
        MediaType: items.every((i) => AUDIO_TYPES.has(i.Type)) ? 'Audio' : 'Video',
        IsPublic: false,
      }),
    onSuccess: (_r, playlistName) => done(playlistName),
    onError: (e) => toast.error(e),
  });

  const list = playlists.data?.Items ?? [];
  const busy = add.isPending || create.isPending;

  return (
    <Modal open onClose={onClose} title={t('common.addToPlaylist')} size="sm">
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
          placeholder={t('media.playlists.newPlaylistName')}
          aria-label={t('media.playlists.newPlaylistName')}
          maxLength={200}
        />
        <Button type="submit" variant="primary" icon={<Plus size={16} />} disabled={!name.trim() || busy} loading={create.isPending}>
          {t('common.create')}
        </Button>
      </form>

      <div className="mt-4 -mx-2 max-h-72 overflow-y-auto">
        {playlists.isLoading ? (
          <div className="flex justify-center py-6 text-accent">
            <Spinner size={24} />
          </div>
        ) : list.length === 0 ? (
          <p className="px-2 py-4 text-sm text-faint">{t('media.playlists.thereAreNoPlaylistsYet')}</p>
        ) : (
          list.map((p) => (
            <button
              key={p.Id}
              disabled={busy}
              onClick={() => add.mutate(p)}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-white/10 disabled:opacity-50"
            >
              <ListMusic size={16} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate">{p.Name}</span>
              {p.ChildCount ? <span className="shrink-0 text-xs text-faint">{p.ChildCount}</span> : null}
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}

/** Dialog to rename a playlist and choose who can see it. */
export function EditPlaylistDialog({ playlist, onClose }: { playlist: BaseItemDto; onClose: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  const access = usePlaylistAccess(playlist.Id);
  const [name, setName] = useState(playlist.Name ?? '');
  const [isPublic, setIsPublic] = useState<boolean | null>(null);
  const publicValue = isPublic ?? access.data?.OpenAccess ?? false;

  const save = useMutation({
    mutationFn: () => api.post(`/Playlists/${playlist.Id}`, { Name: name.trim(), IsPublic: publicValue }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [MEDIA] });
      toast.success(t('media.playlists.playlistSaved'));
      onClose();
    },
    onError: (e) => toast.error(e),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={t('media.playlists.editPlaylist')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={!name.trim() || access.isLoading} onClick={() => save.mutate()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && !access.isLoading) save.mutate();
        }}
      >
        <Field label={t('common.name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus />
        </Field>
        <div className="mt-3">
          <Switch
            label={t('media.playlists.visibleToAllUsers')}
            description={t('media.playlists.publicHint')}
            checked={publicValue}
            disabled={access.isLoading}
            onChange={setIsPublic}
          />
        </div>
      </form>
    </Modal>
  );
}
