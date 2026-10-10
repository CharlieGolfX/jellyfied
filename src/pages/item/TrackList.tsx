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
const entryId = (t: BaseItemDto) => t.PlaylistItemId ?? t.Id;

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
  const tracks = order ? order.map((id) => listed.find((t) => entryId(t) === id)).filter((t) => t !== undefined) : listed;

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
      const moved = dropped.current && dragId && index >= 0 && index !== listed.findIndex((t) => entryId(t) === dragId);
      setDragId(null);
      if (!moved) {
        setOrder(null);
        return;
      }
      // Keep showing the new order until the server's list has been loaded again.
      move.mutate({ entryId: dragId, index }, { onError: (e) => toast.error(e), onSettled: () => setOrder(null) });
    },
  });

  const discs = new Set(tracks.map((t) => t.ParentIndexNumber ?? 1));
  const multiDisc = discs.size > 1 && numbered === 'index';
  let lastDisc: number | null = null;

  const audioTracks = tracks.filter((t) => t.MediaType === 'Audio');

  const playAt = (track: BaseItemDto) => {
    if (track.MediaType !== 'Audio') {
      void play(track);
      return;
    }
    const idx = audioTracks.findIndex((t) => t.Id === track.Id);
    if (player.current?.Id === track.Id) player.toggle();
    else player.play(audioTracks, Math.max(0, idx));
  };

  return (
    <div className="divide-y divide-white/5">
      {tracks.map((t, i) => {
        const disc = t.ParentIndexNumber ?? 1;
        const header = multiDisc && disc !== lastDisc ? <div className="px-3 pt-5 pb-2 text-sm font-semibold text-muted">Disc {disc}</div> : null;
        lastDisc = disc;
        const isCurrent = player.current?.Id === t.Id;
        const artists = t.ArtistItems?.length ? t.ArtistItems : [];
        const showArtists = artists.length > 0 && artists.map((a) => a.Name).join(', ') !== albumArtist;
        const art =
          showArt && (t.ImageTags?.Primary || t.AlbumPrimaryImageTag)
            ? t.ImageTags?.Primary
              ? api.imageUrl(t.Id, 'Primary', { tag: t.ImageTags.Primary, maxWidth: 80 })
              : api.imageUrl(t.AlbumId!, 'Primary', { tag: t.AlbumPrimaryImageTag, maxWidth: 80 })
            : undefined;

        return (
          <div key={t.PlaylistItemId ?? `${t.Id}-${i}`} className="border-0">
            {header}
            <div
              className={clsx(
                'group grid items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-white/5',
                editable ? 'grid-cols-[1rem_2.5rem_1fr_auto]' : 'grid-cols-[2.5rem_1fr_auto]',
                isCurrent && 'bg-white/5',
                dragId === entryId(t) && 'opacity-40',
              )}
              onDoubleClick={() => playAt(t)}
              data-testid="track-row"
              {...(editable ? dragProps(entryId(t)) : undefined)}
            >
              {editable && (
                <span className="cursor-grab text-faint opacity-0 group-hover:opacity-100" title="Drag to reorder" aria-hidden>
                  <GripVertical size={16} />
                </span>
              )}
              <button
                onClick={() => playAt(t)}
                className="flex h-8 w-8 items-center justify-center text-sm text-muted tabular-nums"
                aria-label={isCurrent && player.isPlaying ? 'Pause' : `Play ${t.Name}`}
              >
                <span className={clsx('group-hover:hidden', isCurrent && 'text-accent')}>
                  {isCurrent && player.isPlaying ? (
                    <span className="flex h-3 items-end gap-0.5">
                      <span className="w-0.5 animate-pulse bg-accent" style={{ height: '100%' }} />
                      <span className="w-0.5 animate-pulse bg-accent [animation-delay:150ms]" style={{ height: '60%' }} />
                      <span className="w-0.5 animate-pulse bg-accent [animation-delay:300ms]" style={{ height: '80%' }} />
                    </span>
                  ) : numbered === 'index' ? (
                    t.IndexNumber ?? i + 1
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
                  <div className={clsx('truncate text-sm', isCurrent ? 'font-semibold text-accent' : 'text-fg')}>{t.Name}</div>
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
                      {showArtists && showAlbum && t.Album && ' — '}
                      {showAlbum && t.AlbumId && (
                        <Link to={`/item/${t.AlbumId}`} className="hover:underline">
                          {t.Album}
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setFavorite.mutate({ id: t.Id, favorite: !t.UserData?.IsFavorite }, { onError: (e) => toast.error(e) })
                  }
                  className={clsx(
                    'rounded-full p-1.5 transition',
                    t.UserData?.IsFavorite ? 'text-accent' : 'text-muted opacity-0 group-hover:opacity-100 hover:text-fg',
                  )}
                  aria-label="Favorite"
                >
                  <Heart size={16} className={t.UserData?.IsFavorite ? 'fill-current' : undefined} />
                </button>
                <span className="w-12 text-right text-sm text-muted tabular-nums">
                  {t.RunTimeTicks ? formatClock(ticksToSeconds(t.RunTimeTicks)) : ''}
                </span>
                <Menu
                  items={[
                    { label: 'Play', icon: <Play size={16} />, onSelect: () => playAt(t) },
                    ...(t.MediaType === 'Audio'
                      ? [
                          { label: 'Play next', icon: <ListPlus size={16} />, onSelect: () => (player.current ? player.playNext([t]) : player.play([t])) },
                          { label: 'Add to queue', icon: <ListEnd size={16} />, onSelect: () => (player.current ? player.enqueue([t]) : player.play([t])) },
                          { label: 'Instant Mix', icon: <Radio size={16} />, onSelect: () => void instantMix(t) },
                        ]
                      : []),
                    ...(supportsPlaylists(t)
                      ? [{ label: 'Add to playlist', icon: <ListMusic size={16} />, onSelect: () => setAddingToPlaylist(t) }]
                      : []),
                    ...(editable && t.PlaylistItemId
                      ? [
                          {
                            label: 'Remove from playlist',
                            icon: <ListX size={16} />,
                            onSelect: () =>
                              void removeFromPlaylist.mutateAsync(t.PlaylistItemId!).then(
                                () => toast.success('Removed from playlist'),
                                (e) => toast.error(e),
                              ),
                          },
                        ]
                      : []),
                    ...(t.AlbumId && showAlbum ? [{ label: 'Go to album', onSelect: () => navigate(`/item/${t.AlbumId}`) }] : []),
                  ]}
                  trigger={({ toggle, open }) => (
                    <button
                      onClick={toggle}
                      aria-expanded={open}
                      aria-label="More"
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
