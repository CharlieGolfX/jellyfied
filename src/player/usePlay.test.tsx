import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BaseItemDto } from '@/api/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Everything the hook reaches for is replaced, so the test sees exactly what it decides to do.
const m = vi.hoisted(() => ({
  navigate: vi.fn(),
  api: { get: vi.fn(), post: vi.fn() },
  audio: { play: vi.fn(), pause: vi.fn() },
  video: { session: null as { itemId: string } | null, expand: vi.fn() },
  toast: { info: vi.fn(), error: vi.fn() },
  sync: null as { inGroup: boolean; setQueue: ReturnType<typeof vi.fn> } | null,
  castTarget: null as { sessionId: string; deviceName: string } | null,
  sendRemotePlay: vi.fn(),
  chromecast: { status: 'off', deviceName: '' },
  castPlay: vi.fn(),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => m.navigate }));
vi.mock('@/auth/AuthProvider', () => ({ useApi: () => m.api, useSession: () => ({ userId: 'user-1', serverId: 'server-1' }) }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => m.toast }));
vi.mock('@/api/device', () => ({ generateId: () => 'token-1' }));
vi.mock('./AudioPlayerProvider', () => ({ useAudioActions: () => m.audio }));
vi.mock('./VideoSession', () => ({ useVideoSession: () => m.video, isPlayPath: (p: string) => p.startsWith('/play/') }));
vi.mock('./SyncPlayProvider', () => ({ useSyncPlayManager: () => m.sync }));
vi.mock('./castTarget', () => ({ getCastTarget: () => m.castTarget, sendRemotePlay: m.sendRemotePlay }));
vi.mock('./chromecast', () => ({ getChromecast: () => m.chromecast, castPlay: m.castPlay }));

import { isPlayable, supportsInstantMix, supportsWatchedState, usePlay } from './usePlay';

const item = (patch: Partial<BaseItemDto>) => ({ Id: 'x', Type: 'Movie', MediaType: 'Video', IsFolder: false, ...patch }) as BaseItemDto;
const list = (items: BaseItemDto[]) => ({ Items: items, TotalRecordCount: items.length });

let host: HTMLDivElement;
let root: Root;
let play: ReturnType<typeof usePlay>;

function Probe() {
  const value = usePlay();
  useEffect(() => {
    play = value;
  });
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.video.session = null;
  m.sync = null;
  m.castTarget = null;
  m.chromecast = { status: 'off', deviceName: '' };
  host = document.createElement('div');
  root = createRoot(host);
  act(() => root.render(<Probe />));
});

afterEach(() => act(() => root.unmount()));

describe('what can be played', () => {
  it('plays videos, music and the things that contain them', () => {
    expect(isPlayable(item({}))).toBe(true);
    expect(isPlayable(item({ Type: 'Audio', MediaType: 'Audio' }))).toBe(true);
    expect(isPlayable(item({ Type: 'Series', MediaType: undefined, IsFolder: true }))).toBe(true);
    expect(isPlayable(item({ Type: 'Playlist', MediaType: undefined, IsFolder: true }))).toBe(true);
  });

  it('does not play people, photos, books or plain folders', () => {
    for (const Type of ['Person', 'Photo', 'PhotoAlbum', 'Book', 'Folder', 'CollectionFolder'] as const) {
      expect(isPlayable(item({ Type, MediaType: undefined }))).toBe(false);
    }
  });

  it('knows which items have a watched state and which can seed an Instant Mix', () => {
    expect(supportsWatchedState(item({ Type: 'Episode' }))).toBe(true);
    expect(supportsWatchedState(item({ Type: 'MusicAlbum' }))).toBe(false);
    expect(supportsInstantMix(item({ Type: 'MusicArtist' }))).toBe(true);
    expect(supportsInstantMix(item({ Type: 'Playlist', MediaType: 'Video' }))).toBe(false);
    expect(supportsInstantMix(item({ Type: 'Movie' }))).toBe(false);
  });
});

describe('usePlay in this browser', () => {
  it('opens the player for a video and pauses the music', async () => {
    await play(item({ Id: 'movie-1' }), { audioStreamIndex: 2 });
    expect(m.audio.pause).toHaveBeenCalled();
    expect(m.navigate).toHaveBeenCalledWith('/play/movie-1', {
      state: {
        token: 'token-1',
        queue: undefined,
        fromStart: undefined,
        audioStreamIndex: 2,
        subtitleStreamIndex: undefined,
        mediaSourceId: undefined,
      },
      replace: false,
    });
  });

  it('brings the mini player back instead of starting the same video again', async () => {
    m.video.session = { itemId: 'movie-1' };
    await play(item({ Id: 'movie-1' }));
    expect(m.video.expand).toHaveBeenCalled();
    expect(m.navigate).not.toHaveBeenCalled();
  });

  it('does start the same video again when asked to play from the beginning', async () => {
    m.video.session = { itemId: 'movie-1' };
    await play(item({ Id: 'movie-1' }), { fromStart: true });
    expect(m.navigate).toHaveBeenCalled();
  });

  it('puts a song in the music player', async () => {
    const song = item({ Id: 'song-1', Type: 'Audio', MediaType: 'Audio' });
    await play(song);
    expect(m.audio.play).toHaveBeenCalledWith([song], 0);
    expect(m.navigate).not.toHaveBeenCalled();
  });

  it('continues a show at the next episode to watch, with the whole show as the queue', async () => {
    const episodes = ['e1', 'e2', 'e3'].map((Id) => item({ Id, Type: 'Episode' }));
    m.api.get.mockImplementation((path: string) => Promise.resolve(path === '/Shows/NextUp' ? list([episodes[1]]) : list(episodes)));
    await play(item({ Id: 'show-1', Type: 'Series', MediaType: undefined, IsFolder: true }));
    expect(m.navigate).toHaveBeenCalledWith(
      '/play/e2',
      expect.objectContaining({ state: expect.objectContaining({ queue: ['e1', 'e2', 'e3'] }) }),
    );
  });

  it('starts a season at its first unwatched episode', async () => {
    const episodes = [
      item({ Id: 'e1', Type: 'Episode', UserData: { Played: true } as BaseItemDto['UserData'] }),
      item({ Id: 'e2', Type: 'Episode', UserData: { Played: false } as BaseItemDto['UserData'] }),
    ];
    m.api.get.mockResolvedValue(list(episodes));
    await play(item({ Id: 'season-1', Type: 'Season', MediaType: undefined, IsFolder: true, SeriesId: 'show-1' }));
    expect(m.navigate).toHaveBeenCalledWith('/play/e2', expect.anything());
  });

  it('plays an album as a music queue', async () => {
    const tracks = ['t1', 't2'].map((Id) => item({ Id, Type: 'Audio', MediaType: 'Audio' }));
    m.api.get.mockResolvedValue(list(tracks));
    await play(item({ Id: 'album-1', Type: 'MusicAlbum', MediaType: undefined, IsFolder: true }));
    expect(m.audio.play).toHaveBeenCalledWith(tracks, 0);
  });

  it('says so when there is nothing to play', async () => {
    m.api.get.mockResolvedValue(list([]));
    await play(item({ Id: 'box-1', Type: 'BoxSet', MediaType: undefined, IsFolder: true }));
    expect(m.toast.info).toHaveBeenCalledWith('Nothing to play here.');
    expect(m.navigate).not.toHaveBeenCalled();
  });

  it('reports a failed lookup instead of throwing', async () => {
    m.api.get.mockRejectedValue(new Error('server down'));
    await play(item({ Id: 'album-1', Type: 'MusicAlbum', MediaType: undefined, IsFolder: true }));
    expect(m.toast.error).toHaveBeenCalled();
  });

  it('starts the video for the whole group while in SyncPlay, at the saved position', async () => {
    m.sync = { inGroup: true, setQueue: vi.fn().mockResolvedValue(undefined) };
    act(() => root.render(<Probe />));
    m.api.get.mockResolvedValue({ PlaybackPositionTicks: 700 });
    await play(item({ Id: 'movie-1' }));
    await vi.waitFor(() => expect(m.sync!.setQueue).toHaveBeenCalledWith(['movie-1'], 0, 700));
    expect(m.navigate).not.toHaveBeenCalled();
  });

  it('starts music for the whole group too, from the beginning', async () => {
    m.sync = { inGroup: true, setQueue: vi.fn().mockResolvedValue(undefined) };
    act(() => root.render(<Probe />));
    await play(item({ Id: 'song-1', Type: 'Audio', MediaType: 'Audio' }));
    await vi.waitFor(() => expect(m.sync!.setQueue).toHaveBeenCalledWith(['song-1'], 0, 0));
    expect(m.audio.play).not.toHaveBeenCalled();
  });
});

describe('usePlay on another device', () => {
  it('sends the item to the chosen Jellyfin app, resuming where it was left', async () => {
    m.castTarget = { sessionId: 's1', deviceName: 'Living room' };
    m.sendRemotePlay.mockResolvedValue(undefined);
    await play(item({ Id: 'movie-1', UserData: { PlaybackPositionTicks: 900 } as BaseItemDto['UserData'] }));
    expect(m.sendRemotePlay).toHaveBeenCalledWith(m.api, m.castTarget, ['movie-1'], { command: 'PlayNow', startPositionTicks: 900 });
    expect(m.toast.info).toHaveBeenCalledWith('Playing on Living room');
    expect(m.navigate).not.toHaveBeenCalled();
  });

  it('sends containers as they are and lets the other app expand them', async () => {
    m.castTarget = { sessionId: 's1', deviceName: 'Living room' };
    m.sendRemotePlay.mockResolvedValue(undefined);
    await play(item({ Id: 'show-1', Type: 'Series', MediaType: undefined, IsFolder: true }), { shuffle: true });
    expect(m.sendRemotePlay).toHaveBeenCalledWith(m.api, m.castTarget, ['show-1'], {
      command: 'PlayShuffle',
      startPositionTicks: undefined,
    });
    expect(m.api.get).not.toHaveBeenCalled();
  });

  it('prefers a connected Chromecast, and passes the chosen tracks along', async () => {
    m.chromecast = { status: 'connected', deviceName: 'TV' };
    m.castPlay.mockResolvedValue(undefined);
    const movie = item({ Id: 'movie-1' });
    await play(movie, { fromStart: true, subtitleStreamIndex: 3 });
    expect(m.castPlay).toHaveBeenCalledWith({ api: m.api, serverId: 'server-1' }, [movie], {
      shuffle: undefined,
      startPositionTicks: 0,
      mediaSourceId: undefined,
      audioStreamIndex: undefined,
      subtitleStreamIndex: 3,
    });
    expect(m.toast.info).toHaveBeenCalledWith('Playing on TV');
  });

  it('continues a show on a Chromecast at the next episode to watch, from where that was left', async () => {
    m.chromecast = { status: 'connected', deviceName: 'TV' };
    m.castPlay.mockResolvedValue(undefined);
    const episodes = ['e1', 'e2', 'e3'].map((Id) => item({ Id, Type: 'Episode' }));
    episodes[1].UserData = { PlaybackPositionTicks: 4200 } as BaseItemDto['UserData'];
    m.api.get.mockImplementation((path: string) => Promise.resolve(path === '/Shows/NextUp' ? list([episodes[1]]) : list(episodes)));
    await play(item({ Id: 'show-1', Type: 'Series', MediaType: undefined, IsFolder: true }));
    expect(m.castPlay).toHaveBeenCalledWith(
      expect.anything(),
      [episodes[1], episodes[2]],
      expect.objectContaining({ startPositionTicks: 4200 }),
    );
  });

  it('starts a season on a Chromecast at its first unwatched episode, or at the very start when asked to', async () => {
    m.chromecast = { status: 'connected', deviceName: 'TV' };
    m.castPlay.mockResolvedValue(undefined);
    const episodes = [
      item({ Id: 'e1', Type: 'Episode', UserData: { Played: true } as BaseItemDto['UserData'] }),
      item({ Id: 'e2', Type: 'Episode', UserData: { Played: false, PlaybackPositionTicks: 90 } as BaseItemDto['UserData'] }),
    ];
    m.api.get.mockResolvedValue(list(episodes));
    const season = item({ Id: 'season-1', Type: 'Season', MediaType: undefined, IsFolder: true, SeriesId: 'show-1' });
    await play(season);
    expect(m.castPlay).toHaveBeenLastCalledWith(expect.anything(), [episodes[1]], expect.objectContaining({ startPositionTicks: 90 }));
    await play(season, { fromStart: true });
    expect(m.castPlay).toHaveBeenLastCalledWith(expect.anything(), [episodes[1]], expect.objectContaining({ startPositionTicks: 0 }));
  });

  it('hands a show to the Chromecast as it is when shuffling, or when its episodes cannot be looked up', async () => {
    m.chromecast = { status: 'connected', deviceName: 'TV' };
    m.castPlay.mockResolvedValue(undefined);
    const show = item({ Id: 'show-1', Type: 'Series', MediaType: undefined, IsFolder: true });
    await play(show, { shuffle: true });
    expect(m.api.get).not.toHaveBeenCalled();
    expect(m.castPlay).toHaveBeenLastCalledWith(expect.anything(), [show], expect.objectContaining({ shuffle: true }));
    m.api.get.mockRejectedValue(new Error('server down'));
    await play(show);
    expect(m.castPlay).toHaveBeenLastCalledWith(expect.anything(), [show], expect.objectContaining({ startPositionTicks: undefined }));
    expect(m.toast.error).not.toHaveBeenCalled();
  });

  it('reports it when the other device cannot be reached', async () => {
    m.castTarget = { sessionId: 's1', deviceName: 'Living room' };
    m.sendRemotePlay.mockRejectedValue(new Error('gone'));
    await play(item({ Id: 'movie-1' }));
    expect(m.toast.error).toHaveBeenCalled();
  });
});
