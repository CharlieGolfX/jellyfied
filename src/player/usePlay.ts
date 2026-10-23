import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi, useSession } from '@/auth/AuthProvider';
import { CARD_FIELDS } from '@/api/queries';
import type { BaseItemDto, ItemsResult } from '@/api/types';
import { useToast } from '@/components/ui/Toast';
import { generateId } from '@/api/device';
import { useAudioActions } from './AudioPlayerProvider';
import { getCastTarget, sendRemotePlay } from './castTarget';
import { castPlay, getChromecast } from './chromecast';
import { useSyncPlayManager } from './SyncPlayProvider';
import { isPlayPath, useVideoSession } from './VideoSession';
import { t } from '@/i18n';

export interface PlayOptions {
  shuffle?: boolean;
  fromStart?: boolean;
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  mediaSourceId?: string;
}

/** State passed to the video player route. */
export interface VideoPlayerState {
  /** Unique per play request; distinguishes "play again" from "expand the mini player". */
  token?: string;
  queue?: string[];
  fromStart?: boolean;
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  mediaSourceId?: string;
  /** Start here instead of at the saved resume position (remote control, SyncPlay). */
  startPositionTicks?: number;
  /** Set when the item is played as part of a SyncPlay group: its entry in the group's queue. */
  syncPlaylistItemId?: string;
}

const CONTAINER_TYPES = new Set([
  'Series',
  'Season',
  'BoxSet',
  'Playlist',
  'MusicAlbum',
  'MusicArtist',
  'MusicGenre',
  'Folder',
  'CollectionFolder',
  'PhotoAlbum',
]);

export function isPlayable(item: BaseItemDto): boolean {
  if (item.Type === 'Person' || item.Type === 'UserView' || item.Type === 'CollectionFolder') return false;
  if (item.Type === 'Photo' || item.Type === 'PhotoAlbum' || item.Type === 'Book') return false;
  if (item.Type === 'Folder') return false;
  if (CONTAINER_TYPES.has(item.Type)) return true;
  return item.MediaType === 'Video' || item.MediaType === 'Audio';
}

export function supportsWatchedState(item: BaseItemDto): boolean {
  return ['Movie', 'Episode', 'Series', 'Season', 'Video', 'MusicVideo', 'Trailer', 'BoxSet', 'AudioBook'].includes(item.Type);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Most items handed to a Chromecast at once. */
const CAST_QUEUE_LIMIT = 100;

/**
 * Returns a function that plays any item. Normally that happens in this browser; while another
 * device is selected with "Play on", the item is sent there instead.
 */
export function usePlay() {
  const api = useApi();
  const { serverId } = useSession();
  const local = useLocalPlay();
  const lookUp = useQueueLookup();
  const toast = useToast();
  return useCallback(
    async (item: BaseItemDto, opts: PlayOptions = {}) => {
      const target = getCastTarget();
      const chromecast = getChromecast();
      if (!target && chromecast.status !== 'connected') return local(item, opts);
      try {
        // Containers (shows, albums, playlists…) are sent as they are; the receiving app expands them.
        const single = !item.IsFolder && !CONTAINER_TYPES.has(item.Type);
        if (chromecast.status === 'connected') {
          let items = [item];
          let startPositionTicks = opts.fromStart ? 0 : single ? (item.UserData?.PlaybackPositionTicks ?? 0) : undefined;
          // The receiver starts a show or season at its first episode. Looked up here, it continues
          // where it was left, as it does in this browser: the episodes from that one on are sent.
          if (!opts.shuffle && (item.Type === 'Series' || item.Type === 'Season')) {
            const queue = await lookUp(item, false).catch(() => null);
            const episodes = queue?.items.filter((e) => e.MediaType === 'Video') ?? [];
            const first = Math.max(0, queue?.startId ? episodes.findIndex((e) => e.Id === queue.startId) : 0);
            const rest = episodes.slice(first, first + CAST_QUEUE_LIMIT);
            if (rest.length) {
              items = rest;
              startPositionTicks = opts.fromStart ? 0 : (rest[0].UserData?.PlaybackPositionTicks ?? 0);
            }
          }
          await castPlay({ api, serverId }, items, {
            shuffle: opts.shuffle,
            startPositionTicks,
            mediaSourceId: opts.mediaSourceId,
            audioStreamIndex: opts.audioStreamIndex,
            subtitleStreamIndex: opts.subtitleStreamIndex,
          });
          toast.info(t('player.play.playingOn', { deviceName: chromecast.deviceName }));
          return;
        }
        if (!target) return;
        await sendRemotePlay(api, target, [item.Id], {
          command: opts.shuffle ? 'PlayShuffle' : 'PlayNow',
          startPositionTicks: opts.fromStart ? 0 : single ? (item.UserData?.PlaybackPositionTicks ?? 0) : undefined,
        });
        toast.info(t('player.play.playingOn', { deviceName: target.deviceName }));
      } catch (err) {
        toast.error(err);
      }
    },
    [api, serverId, local, lookUp, toast],
  );
}

/**
 * Looks up what a show, season, album, playlist or folder consists of, and which of those items to
 * start with when that isn't the first: the next episode to watch of a show, or the first
 * unwatched one of a season.
 */
function useQueueLookup() {
  const api = useApi();
  const { userId } = useSession();

  const fetchChildren = useCallback(
    async (item: BaseItemDto, shuffleItems: boolean): Promise<BaseItemDto[]> => {
      const base = {
        userId,
        fields: [...CARD_FIELDS, 'MediaSources'],
        enableUserData: true,
        imageTypeLimit: 1,
        enableImageTypes: ['Primary', 'Backdrop', 'Thumb'],
        limit: 500,
      };
      let result: ItemsResult;
      switch (item.Type) {
        case 'Series':
          result = await api.get<ItemsResult>(`/Shows/${item.Id}/Episodes`, {
            ...base,
            sortBy: shuffleItems ? 'Random' : undefined,
          });
          break;
        case 'Season':
          result = await api.get<ItemsResult>(`/Shows/${item.SeriesId}/Episodes`, { ...base, seasonId: item.Id });
          break;
        case 'MusicArtist':
          result = await api.get<ItemsResult>('/Items', {
            ...base,
            artistIds: item.Id,
            recursive: true,
            includeItemTypes: 'Audio',
            sortBy: shuffleItems ? 'Random' : ['ProductionYear', 'Album', 'ParentIndexNumber', 'IndexNumber', 'SortName'],
          });
          break;
        case 'MusicGenre':
          result = await api.get<ItemsResult>('/Items', {
            ...base,
            genreIds: item.Id,
            recursive: true,
            includeItemTypes: 'Audio',
            sortBy: shuffleItems ? 'Random' : ['AlbumArtist', 'Album', 'ParentIndexNumber', 'IndexNumber'],
          });
          break;
        case 'MusicAlbum':
          result = await api.get<ItemsResult>('/Items', {
            ...base,
            parentId: item.Id,
            recursive: true,
            includeItemTypes: 'Audio',
            sortBy: ['ParentIndexNumber', 'IndexNumber', 'SortName'],
          });
          break;
        case 'Playlist':
          // Playlist order is preserved when no sort is requested.
          result = await api.get<ItemsResult>(`/Playlists/${item.Id}/Items`, base);
          break;
        default:
          result = await api.get<ItemsResult>('/Items', {
            ...base,
            parentId: item.Id,
            recursive: true,
            filters: 'IsNotFolder',
            mediaTypes: ['Video', 'Audio'],
            sortBy: shuffleItems ? 'Random' : item.Type === 'BoxSet' ? ['ProductionYear', 'PremiereDate', 'SortName'] : 'SortName',
          });
      }
      const items = result.Items.filter((i) => i.MediaType === 'Video' || i.MediaType === 'Audio');
      return shuffleItems ? shuffle(items) : items;
    },
    [api, userId],
  );

  return useCallback(
    async (item: BaseItemDto, shuffleItems: boolean): Promise<{ items: BaseItemDto[]; startId?: string }> => {
      if (shuffleItems) return { items: await fetchChildren(item, true) };
      if (item.Type === 'Series') {
        const nextUp = await api.get<ItemsResult>('/Shows/NextUp', {
          userId,
          seriesId: item.Id,
          limit: 1,
          enableResumable: true,
          disableFirstEpisode: false,
        });
        return { items: await fetchChildren(item, false), startId: nextUp.Items[0]?.Id };
      }
      const items = await fetchChildren(item, false);
      const firstUnplayed = item.Type === 'Season' ? items.find((i) => i.MediaType === 'Video' && !i.UserData?.Played) : undefined;
      return { items, startId: firstUnplayed?.Id };
    },
    [api, userId, fetchChildren],
  );
}

/** Plays any item in this browser: videos open the player, audio goes to the music queue. */
export function useLocalPlay() {
  const api = useApi();
  const { userId } = useSession();
  const navigate = useNavigate();
  const audio = useAudioActions();
  const videoSession = useVideoSession();
  const toast = useToast();
  const sync = useSyncPlayManager();
  const lookUp = useQueueLookup();

  const playVideoQueue = useCallback(
    (ids: string[], startIndex: number, opts: PlayOptions = {}) => {
      if (!ids.length) return;
      audio.pause();
      // Already playing this item in the mini player: just bring it back full screen.
      if (videoSession.session?.itemId === ids[startIndex] && !opts.fromStart) {
        videoSession.expand();
        return;
      }
      if (sync?.inGroup) {
        // In a SyncPlay group the video starts for everyone, at the same position.
        void (async () => {
          try {
            let ticks = 0;
            if (!opts.fromStart) {
              const data = await api.get<{ PlaybackPositionTicks?: number }>(`/UserItems/${ids[startIndex]}/UserData`, { userId });
              ticks = data.PlaybackPositionTicks ?? 0;
            }
            await sync.setQueue(ids, startIndex, ticks);
          } catch (err) {
            toast.error(err);
          }
        })();
        return;
      }
      const state: VideoPlayerState = {
        token: generateId(),
        queue: ids.length > 1 ? ids : undefined,
        fromStart: opts.fromStart,
        audioStreamIndex: opts.audioStreamIndex,
        subtitleStreamIndex: opts.subtitleStreamIndex,
        mediaSourceId: opts.mediaSourceId,
      };
      // Replacing another video (e.g. started by remote control): don't stack player pages in the history.
      navigate(`/play/${ids[startIndex]}`, { state, replace: isPlayPath(window.location.pathname) });
    },
    [audio, navigate, videoSession, sync, api, userId, toast],
  );

  const playAudioQueue = useCallback(
    (items: BaseItemDto[], startIndex: number) => {
      if (sync?.inGroup) {
        // In a SyncPlay group music starts for everyone too, from the beginning.
        sync
          .setQueue(
            items.map((i) => i.Id),
            startIndex,
            0,
          )
          .catch((err) => toast.error(err));
        return;
      }
      audio.play(items, startIndex);
    },
    [audio, sync, toast],
  );

  return useCallback(
    async (item: BaseItemDto, opts: PlayOptions = {}) => {
      try {
        if (item.MediaType === 'Audio' && !item.IsFolder) {
          playAudioQueue([item], 0);
          return;
        }
        if (item.MediaType === 'Video' && !item.IsFolder) {
          playVideoQueue([item.Id], 0, opts);
          return;
        }

        // A show continues where the user left off, and a season at its first unwatched episode,
        // unless shuffling.
        const { items: children, startId } = await lookUp(item, Boolean(opts.shuffle));
        if (item.Type === 'Series' && !opts.shuffle) {
          if (!children.length) throw new Error(t('player.play.noPlayableEpisodesFound'));
          playVideoQueue(
            children.map((e) => e.Id),
            Math.max(0, startId ? children.findIndex((e) => e.Id === startId) : 0),
            opts,
          );
          return;
        }

        if (!children.length) {
          toast.info(t('player.play.nothingToPlayHere'));
          return;
        }
        if (children[0].MediaType === 'Audio') {
          playAudioQueue(
            children.filter((c) => c.MediaType === 'Audio'),
            0,
          );
          return;
        }
        const videos = children.filter((c) => c.MediaType === 'Video');
        playVideoQueue(
          videos.map((v) => v.Id),
          Math.max(0, startId ? videos.findIndex((v) => v.Id === startId) : 0),
          opts,
        );
      } catch (err) {
        toast.error(err);
      }
    },
    [lookUp, playVideoQueue, playAudioQueue, toast],
  );
}

const INSTANT_MIX_TYPES = new Set(['Audio', 'MusicAlbum', 'MusicArtist', 'MusicGenre', 'Playlist']);

/** Instant Mix: the server builds a queue of similar songs from a track, album, artist, genre or playlist. */
export function supportsInstantMix(item: BaseItemDto): boolean {
  if (item.Type === 'Playlist') return item.MediaType === 'Audio';
  return INSTANT_MIX_TYPES.has(item.Type);
}

export function useInstantMix() {
  const api = useApi();
  const { userId } = useSession();
  const audio = useAudioActions();
  const toast = useToast();
  const sync = useSyncPlayManager();
  return useCallback(
    async (item: BaseItemDto) => {
      try {
        const result = await api.get<ItemsResult>(`/Items/${item.Id}/InstantMix`, {
          userId,
          limit: 200,
          fields: [...CARD_FIELDS, 'MediaSources'],
          enableUserData: true,
          imageTypeLimit: 1,
          enableImageTypes: ['Primary'],
        });
        const tracks = result.Items.filter((i) => i.MediaType === 'Audio');
        if (!tracks.length) {
          toast.info(t('player.play.noInstantMix'));
          return;
        }
        // In a SyncPlay group the mix plays for everyone.
        if (sync?.inGroup)
          await sync.setQueue(
            tracks.map((i) => i.Id),
            0,
            0,
          );
        else audio.play(tracks);
      } catch (err) {
        toast.error(err);
      }
    },
    [api, userId, audio, toast, sync],
  );
}
