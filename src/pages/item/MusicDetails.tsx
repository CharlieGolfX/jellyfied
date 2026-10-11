import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CARD_FIELDS, MEDIA, useItems } from '@/api/queries';
import type { BaseItemDto, ItemsResult } from '@/api/types';
import { useApi, useSession } from '@/auth/AuthProvider';
import { CardGrid } from '@/components/media/CardGrid';
import { Hub } from '@/components/media/Hub';
import { EditPlaylistDialog, useCanEditPlaylist } from '@/components/media/Playlists';
import { PageSpinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { formatRuntime, plural } from '@/lib/format';
import { ActionBar, DetailFrame, ExpandableText, MetaLine } from './common';
import { TrackList } from './TrackList';

const TRACK_FIELDS = [...CARD_FIELDS, 'MediaSources'];

export function AlbumDetails({ item }: { item: BaseItemDto }) {
  const tracks = useItems(
    {
      parentId: item.Id,
      recursive: true,
      includeItemTypes: 'Audio',
      sortBy: 'ParentIndexNumber,IndexNumber,SortName',
      fields: TRACK_FIELDS,
    },
    { key: ['album-tracks', item.Id] },
  );
  const artistId = item.AlbumArtists?.[0]?.Id;
  const moreByArtist = useItems(
    {
      albumArtistIds: artistId,
      recursive: true,
      includeItemTypes: 'MusicAlbum',
      excludeItemIds: item.Id,
      sortBy: 'ProductionYear,SortName',
      sortOrder: 'Descending',
      limit: 20,
    },
    { enabled: Boolean(artistId), key: ['more-by', artistId] },
  );

  const list = tracks.data?.Items ?? [];
  const totalTicks = list.reduce((sum, t) => sum + (t.RunTimeTicks ?? 0), 0);

  return (
    <DetailFrame
      item={item}
      shape="square"
      above={
        item.AlbumArtists?.length ? (
          <span>
            {item.AlbumArtists.map((a, i) => (
              <span key={a.Id}>
                {i > 0 && ', '}
                <Link to={`/item/${a.Id}`} className="hover:text-fg hover:underline">
                  {a.Name}
                </Link>
              </span>
            ))}
          </span>
        ) : (
          item.AlbumArtist
        )
      }
      header={
        <>
          <MetaLine
            item={{ ...item, RunTimeTicks: null }}
            extra={
              list.length > 0 ? (
                <span>
                  {plural(list.length, 'track')} · {formatRuntime(totalTicks)}
                </span>
              ) : undefined
            }
          />
          {item.Genres?.length ? <div className="text-sm text-muted">{item.Genres.join(', ')}</div> : null}
          <div className="pt-2">
            <ActionBar item={item} showShuffle />
          </div>
          <ExpandableText text={item.Overview} className="max-w-4xl pt-1" />
        </>
      }
    >
      <section className="px-4 sm:px-8 lg:px-10">
        {tracks.isLoading ? (
          <PageSpinner />
        ) : tracks.error ? (
          <ErrorState error={tracks.error} onRetry={() => tracks.refetch()} />
        ) : (
          <TrackList tracks={list} albumArtist={item.AlbumArtist} />
        )}
      </section>
      <Hub
        title={`More by ${item.AlbumArtist ?? 'this artist'}`}
        items={moreByArtist.data?.Items}
        shape="square"
        to={artistId ? `/item/${artistId}` : undefined}
      />
    </DetailFrame>
  );
}

export function ArtistDetails({ item }: { item: BaseItemDto }) {
  const api = useApi();
  const { userId } = useSession();
  const albums = useItems(
    {
      albumArtistIds: item.Id,
      recursive: true,
      includeItemTypes: 'MusicAlbum',
      sortBy: 'PremiereDate,ProductionYear,SortName',
      sortOrder: 'Descending',
    },
    { key: ['artist-albums', item.Id] },
  );
  const appearsOn = useItems(
    {
      contributingArtistIds: item.Id,
      excludeItemIds: albums.data?.Items.map((a) => a.Id).join(',') || undefined,
      recursive: true,
      includeItemTypes: 'MusicAlbum',
      sortBy: 'PremiereDate,ProductionYear,SortName',
      sortOrder: 'Descending',
      limit: 24,
    },
    { key: ['artist-appears', item.Id], enabled: Boolean(albums.data) },
  );
  const popular = useItems(
    {
      artistIds: item.Id,
      recursive: true,
      includeItemTypes: 'Audio',
      sortBy: 'PlayCount,SortName',
      sortOrder: 'Descending',
      limit: 10,
      fields: TRACK_FIELDS,
    },
    { key: ['artist-popular', item.Id] },
  );
  const similar = useQuery({
    queryKey: [MEDIA, 'similar-artists', item.Id],
    queryFn: () => api.get<ItemsResult>(`/Artists/${item.Id}/Similar`, { userId, limit: 16 }),
  });

  const appears = (appearsOn.data?.Items ?? []).filter((a) => !albums.data?.Items.some((b) => b.Id === a.Id));

  return (
    <DetailFrame
      item={item}
      shape="square"
      roundPoster
      header={
        <>
          {item.Genres?.length ? <div className="text-[15px] text-muted">{item.Genres.join(', ')}</div> : null}
          <div className="pt-2">
            <ActionBar item={item} showShuffle />
          </div>
          <ExpandableText text={item.Overview} className="max-w-4xl pt-1" />
        </>
      }
    >
      {(popular.data?.Items.length ?? 0) > 0 && (
        <section className="px-4 sm:px-8 lg:px-10">
          <h2 className="mb-3 text-lg font-semibold">Popular Tracks</h2>
          <TrackList tracks={popular.data!.Items} albumArtist={item.Name} showAlbum showArt numbered="position" />
        </section>
      )}
      <section className="px-4 sm:px-8 lg:px-10">
        <h2 className="mb-4 text-lg font-semibold">Albums</h2>
        {albums.isLoading ? (
          <PageSpinner />
        ) : (albums.data?.Items.length ?? 0) === 0 ? (
          <p className="text-sm text-muted">No albums.</p>
        ) : (
          <CardGrid items={albums.data!.Items} shape="square" />
        )}
      </section>
      <Hub title="Appears On" items={appears} shape="square" />
      <Hub title="Similar Artists" items={similar.data?.Items} shape="square" />
    </DetailFrame>
  );
}

export function PlaylistDetails({ item }: { item: BaseItemDto }) {
  const api = useApi();
  const { userId } = useSession();
  const entries = useQuery({
    queryKey: [MEDIA, 'playlist', item.Id],
    queryFn: () =>
      api.get<ItemsResult>(`/Playlists/${item.Id}/Items`, {
        userId,
        fields: TRACK_FIELDS,
        enableImageTypes: ['Primary'],
        imageTypeLimit: 1,
        enableUserData: true,
      }),
  });
  const list = entries.data?.Items ?? [];
  const totalTicks = list.reduce((sum, t) => sum + (t.RunTimeTicks ?? 0), 0);
  const canEdit = useCanEditPlaylist(item.Id);
  const [editing, setEditing] = useState(false);

  return (
    <DetailFrame
      item={item}
      shape="square"
      header={
        <>
          <MetaLine
            item={{ ...item, RunTimeTicks: null, ProductionYear: null }}
            extra={
              list.length ? (
                <span>
                  {plural(list.length, 'item')} · {formatRuntime(totalTicks)}
                </span>
              ) : undefined
            }
          />
          <div className="pt-2">
            <ActionBar
              item={item}
              showShuffle
              extraMenu={canEdit ? [{ label: 'Edit playlist', icon: <Pencil size={16} />, onSelect: () => setEditing(true) }] : []}
            />
          </div>
          <ExpandableText text={item.Overview} className="max-w-4xl pt-1" />
          {editing && <EditPlaylistDialog playlist={item} onClose={() => setEditing(false)} />}
        </>
      }
    >
      <section className="px-4 sm:px-8 lg:px-10">
        {entries.isLoading ? (
          <PageSpinner />
        ) : entries.error ? (
          <ErrorState error={entries.error} onRetry={() => entries.refetch()} />
        ) : list.length === 0 ? (
          <p className="text-sm text-muted">
            This playlist is empty. Use “Add to playlist” in the menu of a song, album, movie or episode to fill it.
          </p>
        ) : (
          <TrackList tracks={list} showAlbum showArt numbered="position" editablePlaylistId={canEdit ? item.Id : undefined} />
        )}
      </section>
    </DetailFrame>
  );
}
