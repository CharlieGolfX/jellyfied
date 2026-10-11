import clsx from 'clsx';
import { GripVertical, Heart, ListEnd, ListMusic, ListPlus, ListX, MoreHorizontal, Pause, Play, Radio } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSetFavorite } from '@/api/queries';
import type { BaseItemDto } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { AddToPlaylistDialog, supportsPlaylists, useMovePlaylistItem, useRemoveFromPlaylist } from '@/components/media/Playlists';
import { Menu } from '@/components/ui/Menu';
import { Img } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { formatClock, ticksToSeconds } from '@/lib/format';
import { useAudioPlayer } from '@/player/AudioPlayerProvider';
import { useInstantMix, usePlay } from '@/player/usePlay';
import { t } from '@/i18n';

interface TrackListProps {
  tracks: BaseItemDto[];
  /** Album artist; track artists are only shown when they differ. */
  albumArtist?: string | null;
  showAlbum?: boolean;
  showArt?: boolean;
  numbered?: 'index' | 'position';
  /** Set on the page of a playlist the user may change: rows can be dragged into another order and removed. */
  editablePlaylistId?: string;
}

/** Id of a row: playlists can hold the same item more than once, so they number their entries. */
const entryId = (entry: BaseItemDto) => entry.PlaylistItemId ?? entry.Id;

export function TrackList({ tracks: listed, albumArtist, showAlbum, showArt, numbered = 'index', editablePlaylistId }: TrackListProps) {
  const api = useApi();
  const navigate = useNavigate();
  const player = useAudioPlayer();
  const play = usePlay();
  const instantMix = useInstantMix();
  const toast = useToast();
  const setFavorite = useSetFavorite();
  const [addingToPlaylist, setAddingToPlaylist] = useState<BaseItemDto | null>(null);

  // Drag-and-drop ordering of an editable playlist.
  const editable = Boolean(editablePlaylistId);
  const removeFromPlaylist = useRemoveFromPlaylist(editablePlaylistId ?? '');
  const move = useMovePlaylistItem(editablePlaylistId ?? '');
  /** Order shown while dragging or saving; null means "use the server's order". */
  const [order, setOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const dropped = useRef(false);
  const tracks = order ? order.map((id) => listed.find((entry) => entryId(entry) === id)).filter((entry) => entry !== undefined) : listed;

  const dragProps = (id: string) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      dropped.current = false;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
      setDragId(id);
      setOrder(listed.map(entryId));
    },
    onDragOver: (e: DragEvent) => {
      if (!dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (id === dragId) return;
      setOrder((cur) => {
        if (!cur) return cur;
        const list = [...cur];
        const from = list.indexOf(dragId);
        const to = list.indexOf(id);
        if (from < 0 || to < 0) return cur;
        list.splice(from, 1);
        list.splice(to, 0, dragId);
        return list;
      });
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      dropped.current = true;
    },
    onDragEnd: () => {
      const index = order?.indexOf(dragId ?? '') ?? -1;
      const moved = dropped.current && dragId && index >= 0 && index !== listed.findIndex((entry) => entryId(entry) === dragId);
      setDragId(null);
      if (!moved) {
        setOrder(null);
        return;
      }
      // Keep showing the new order until the server's list has been loaded again.
      move.mutate({ entryId: dragId, index }, { onError: (e) => toast.error(e), onSettled: () => setOrder(null) });
    },
  });

  const discs = new Set(tracks.map((track) => track.ParentIndexNumber ?? 1));
  const multiDisc = discs.size > 1 && numbered === 'index';

  const audioTracks = tracks.filter((track) => track.MediaType === 'Audio');

  const playAt = (track: BaseItemDto) => {
    if (track.MediaType !== 'Audio') {
      void play(track);
      return;
    }
    const idx = audioTracks.findIndex((audioTrack) => audioTrack.Id === track.Id);
    if (player.current?.Id === track.Id) player.toggle();
    else player.play(audioTracks, Math.max(0, idx));
  };

  return (
    <div className="divide-y divide-white/5">
      {tracks.map((track, i) => {
        const disc = track.ParentIndexNumber ?? 1;
        const previousDisc = i > 0 ? (tracks[i - 1].ParentIndexNumber ?? 1) : undefined;
        const header =
          multiDisc && disc !== previousDisc ? (
            <div className="px-3 pt-5 pb-2 text-sm font-semibold text-muted">
              {t('item.trackList.disc')} {disc}
            </div>
          ) : null;
        const isCurrent = player.current?.Id === track.Id;
        const artists = track.ArtistItems?.length ? track.ArtistItems : [];
        const showArtists = artists.length > 0 && artists.map((a) => a.Name).join(', ') !== albumArtist;
        const art =
          showArt && (track.ImageTags?.Primary || track.AlbumPrimaryImageTag)
            ? track.ImageTags?.Primary
              ? api.imageUrl(track.Id, 'Primary', { tag: track.ImageTags.Primary, maxWidth: 80 })
              : api.imageUrl(track.AlbumId!, 'Primary', { tag: track.AlbumPrimaryImageTag, maxWidth: 80 })
            : undefined;

        return (
          <div key={track.PlaylistItemId ?? `${track.Id}-${i}`} className="border-0">
            {header}
            <div
              className={clsx(
                'group grid items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-white/5',
                editable ? 'grid-cols-[1rem_2.5rem_1fr_auto]' : 'grid-cols-[2.5rem_1fr_auto]',
                isCurrent && 'bg-white/5',
                dragId === entryId(track) && 'opacity-40',
              )}
              onDoubleClick={() => playAt(track)}
              data-testid="track-row"
              {...(editable ? dragProps(entryId(track)) : undefined)}
            >
              {editable && (
                <span
                  className="cursor-grab text-faint opacity-0 group-hover:opacity-100"
                  title={t('item.trackList.dragToReorder')}
                  aria-hidden
                >
                  <GripVertical size={16} />
                </span>
              )}
              <button
                onClick={() => playAt(track)}
                className="flex h-8 w-8 items-center justify-center text-sm text-muted tabular-nums"
                aria-label={isCurrent && player.isPlaying ? t('common.pause') : t('item.trackList.play', { name: track.Name })}
              >
                <span className={clsx('group-hover:hidden', isCurrent && 'text-accent')}>
                  {isCurrent && player.isPlaying ? (
                    <span className="flex h-3 items-end gap-0.5">
                      <span className="w-0.5 animate-pulse bg-accent" style={{ height: '100%' }} />
                      <span className="w-0.5 animate-pulse bg-accent [animation-delay:150ms]" style={{ height: '60%' }} />
                      <span className="w-0.5 animate-pulse bg-accent [animation-delay:300ms]" style={{ height: '80%' }} />
                    </span>
                  ) : numbered === 'index' ? (
                    (track.IndexNumber ?? i + 1)
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="hidden text-fg group-hover:inline">
                  {isCurrent && player.isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                </span>
              </button>
              <div className="flex min-w-0 items-center gap-3">
                {showArt && (
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-base-800">
                    <Img src={art} className="h-full w-full object-cover" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className={clsx('truncate text-sm', isCurrent ? 'font-semibold text-accent' : 'text-fg')}>{track.Name}</div>
                  {(showArtists || showAlbum) && (
                    <div className="truncate text-xs text-muted">
                      {showArtists &&
                        artists.map((a, j) => (
                          <span key={a.Id}>
                            {j > 0 && ', '}
                            <Link to={`/item/${a.Id}`} className="hover:underline">
                              {a.Name}
                            </Link>
                          </span>
                        ))}
                      {showArtists && showAlbum && track.Album && ' — '}
                      {showAlbum && track.AlbumId && (
                        <Link to={`/item/${track.AlbumId}`} className="hover:underline">
                          {track.Album}
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setFavorite.mutate({ id: track.Id, favorite: !track.UserData?.IsFavorite }, { onError: (e) => toast.error(e) })
                  }
                  className={clsx(
                    'rounded-full p-1.5 transition',
                    track.UserData?.IsFavorite ? 'text-accent' : 'text-muted opacity-0 group-hover:opacity-100 hover:text-fg',
                  )}
                  aria-label={t('item.trackList.favorite')}
                >
                  <Heart size={16} className={track.UserData?.IsFavorite ? 'fill-current' : undefined} />
                </button>
                <span className="w-12 text-right text-sm text-muted tabular-nums">
                  {track.RunTimeTicks ? formatClock(ticksToSeconds(track.RunTimeTicks)) : ''}
                </span>
                <Menu
                  items={[
                    { label: t('common.play'), icon: <Play size={16} />, onSelect: () => playAt(track) },
                    ...(track.MediaType === 'Audio'
                      ? [
                          {
                            label: t('item.trackList.playNext'),
                            icon: <ListPlus size={16} />,
                            onSelect: () => (player.current ? player.playNext([track]) : player.play([track])),
                          },
                          {
                            label: t('item.trackList.addToQueue'),
                            icon: <ListEnd size={16} />,
                            onSelect: () => (player.current ? player.enqueue([track]) : player.play([track])),
                          },
                          { label: t('common.instantMix'), icon: <Radio size={16} />, onSelect: () => void instantMix(track) },
                        ]
                      : []),
                    ...(supportsPlaylists(track)
                      ? [
                          {
                            label: t('common.addToPlaylist'),
                            icon: <ListMusic size={16} />,
                            onSelect: () => setAddingToPlaylist(track),
                          },
                        ]
                      : []),
                    ...(editable && track.PlaylistItemId
                      ? [
                          {
                            label: t('item.trackList.removeFromPlaylist'),
                            icon: <ListX size={16} />,
                            onSelect: () =>
                              void removeFromPlaylist.mutateAsync(track.PlaylistItemId!).then(
                                () => toast.success(t('item.trackList.removedFromPlaylist')),
                                (e) => toast.error(e),
                              ),
                          },
                        ]
                      : []),
                    ...(track.AlbumId && showAlbum
                      ? [{ label: t('item.trackList.goToAlbum'), onSelect: () => navigate(`/item/${track.AlbumId}`) }]
                      : []),
                  ]}
                  trigger={({ toggle, open }) => (
                    <button
                      onClick={toggle}
                      aria-expanded={open}
                      aria-label={t('common.more')}
                      className="rounded-full p-1.5 text-muted opacity-0 group-hover:opacity-100 hover:text-fg aria-expanded:opacity-100"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  )}
                />
              </div>
            </div>
          </div>
        );
      })}
      {addingToPlaylist && <AddToPlaylistDialog item={addingToPlaylist} onClose={() => setAddingToPlaylist(null)} />}
    </div>
  );
}
