import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BaseItemDto, MediaSourceInfo, MediaStream } from '@/api/types';
import { renderHook, stubMediaElements } from '@/test/renderHook';
import type { ProfileOptions } from '../deviceProfile';

// The hook is run for real; the server, the browser's abilities and the subtitle drawing are stand-ins.
const m = vi.hoisted(() => ({
  post: vi.fn(),
  request: vi.fn((_method: string, _path: string, _opts?: unknown) => Promise.resolve()),
  audioPause: vi.fn(),
  chromium: true,
  hlsJs: true,
  nativeHls: false,
  canRenderAss: true,
  styled: true,
  ass: vi.fn(),
  pgs: vi.fn(),
  vobSub: vi.fn(),
  hls: [] as { url?: string; config: { startPosition: number }; destroyed: boolean }[],
}));

vi.mock('@/auth/AuthProvider', () => ({
  useApi: () => api,
  useSession: () => ({ userId: 'user-1', serverId: 'server-1' }),
}));
vi.mock('@/api/device', () => ({ generateId: () => 'generated-id', isChromium: () => m.chromium }));
vi.mock('../AudioPlayerProvider', () => ({ useAudioPlayer: () => ({ pause: m.audioPause }) }));
vi.mock('../SyncPlayProvider', () => ({ useSyncPlayManager: () => null }));
vi.mock('../deviceProfile', () => ({
  MAX_BITRATE: 120_000_000,
  canRenderAss: () => m.canRenderAss,
  buildDeviceProfile: (bitrate: number, opts: ProfileOptions) => ({ bitrate, ...opts }),
}));
vi.mock('../subtitleStyle', () => ({ getSubtitleStyle: () => ({ styled: m.styled }) }));
vi.mock('./hlsSupport', async (original) => ({
  ...(await original<typeof import('./hlsSupport')>()),
  hlsJsSupported: () => m.hlsJs,
  nativeHlsSupported: () => m.nativeHls,
}));
vi.mock('./subtitleRenderers', async (original) => ({
  ...(await original<typeof import('./subtitleRenderers')>()),
  createAssSubtitles: m.ass,
  createPgsSubtitles: m.pgs,
  createVobSubSubtitles: m.vobSub,
}));
vi.mock('hls.js', () => ({
  ErrorTypes: { MEDIA_ERROR: 'mediaError', NETWORK_ERROR: 'networkError' },
  Events: { ERROR: 'hlsError' },
  default: class {
    entry: (typeof m.hls)[number];
    constructor(config: { startPosition: number }) {
      this.entry = { config, destroyed: false };
      m.hls.push(this.entry);
    }
    on() {}
    loadSource(url: string) {
      this.entry.url = url;
    }
    attachMedia() {}
    destroy() {
      this.entry.destroyed = true;
    }
  },
}));

import { usePlaybackStream } from './usePlaybackStream';

const api = {
  serverUrl: '',
  deviceId: 'device-1',
  post: m.post,
  request: m.request,
  authorizationHeader: () => 'MediaBrowser Token="t"',
  url: (path: string, query?: Record<string, unknown>) => `${path}${query?.static ? '?static=true' : ''}`,
};

const sub = (Index: number, Codec: string, patch: Partial<MediaStream> = {}): MediaStream => ({
  Type: 'Subtitle',
  Index,
  Codec,
  DeliveryMethod: 'External',
  DeliveryUrl: `/Videos/item-1/source-1/Subtitles/${Index}/0/Stream.${Codec === 'subrip' ? 'vtt' : Codec === 'PGSSUB' ? 'pgssub' : Codec}`,
  ...patch,
});
const STREAMS: MediaStream[] = [
  { Type: 'Video', Index: 0, Codec: 'h264' },
  { Type: 'Audio', Index: 1, Codec: 'aac', Language: 'eng' },
  sub(2, 'subrip'),
  sub(3, 'ass'),
  sub(4, 'PGSSUB'),
  sub(5, 'DVDSUB'),
];
const source = (patch: Partial<MediaSourceInfo> = {}): MediaSourceInfo => ({
  Id: 'source-1',
  Container: 'mkv',
  Protocol: 'File',
  SupportsDirectPlay: true,
  MediaStreams: STREAMS,
  DefaultAudioStreamIndex: 1,
  ...patch,
});
const TRANSCODE = {
  SupportsDirectPlay: false,
  TranscodingUrl: '/videos/item-1/master.m3u8?TranscodeReasons=ContainerNotSupported,AudioCodecNotSupported',
  TranscodingSubProtocol: 'hls' as const,
};
const item = (patch: Partial<BaseItemDto> = {}) =>
  ({ Id: 'item-1', Type: 'Movie', RunTimeTicks: 60_000_000_000, MediaSources: [source()], ...patch }) as BaseItemDto;

interface InfoRequest {
  SubtitleStreamIndex?: number;
  AudioStreamIndex?: number;
  EnableDirectPlay: boolean;
  MaxStreamingBitrate: number;
  DeviceProfile: ProfileOptions & { bitrate: number };
}
/** What the hook asked the server for, newest last. */
const asked = () => m.post.mock.calls.map(([, body]) => body as InfoRequest);
/** The server answers every request for a stream with this media source. */
const serverAnswers = (...sources: Partial<MediaSourceInfo>[]) => {
  m.post.mockReset();
  for (const s of sources.slice(0, -1)) m.post.mockResolvedValueOnce({ MediaSources: [source(s)], PlaySessionId: 'play-1' });
  m.post.mockResolvedValue({ MediaSources: [source(sources.at(-1))], PlaySessionId: 'play-1' });
};
const reports = () => m.request.mock.calls.map(([method, path]) => `${method} ${path}`);

let video: HTMLVideoElement;
const fire = (type: string) => act(() => void video.dispatchEvent(new Event(type)));
const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));

interface Options {
  item?: BaseItemDto;
  navState?: Parameters<typeof usePlaybackStream>[0]['navState'];
  inPip?: boolean;
  airPlay?: boolean;
  audioDelayed?: boolean;
}
async function start(options: Options = {}) {
  // What the player hands over stays the same from one render to the next, as it does in the player.
  const refs = { videoRef: { current: video }, assLayerRef: { current: document.createElement('div') } };
  const defaults = { item: item(), navState: {} };
  const hook = renderHook(
    (o: Options) =>
      usePlaybackStream({
        itemId: 'item-1',
        item: o.item ?? defaults.item,
        navState: o.navState ?? defaults.navState,
        videoRef: refs.videoRef,
        seriesId: undefined,
        rememberAudio: true,
        rememberSubtitles: true,
        assLayerRef: refs.assLayerRef,
        pgsLayerRef: refs.assLayerRef,
        subtitleDelay: 0,
        inPip: o.inPip ?? false,
        airPlay: o.airPlay ?? false,
        audioDelayed: o.audioDelayed ?? false,
      }),
    { props: options },
  );
  await settle();
  return hook;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  stubMediaElements();
  Object.assign(m, { chromium: true, hlsJs: true, nativeHls: false, canRenderAss: true, styled: true, hls: [] });
  const canvas = () => ({ setDelay: vi.fn(), destroy: vi.fn() });
  m.ass.mockImplementation(() => Promise.resolve(canvas()));
  m.pgs.mockImplementation(() => Promise.resolve(canvas()));
  m.vobSub.mockImplementation(() => Promise.resolve(canvas()));
  serverAnswers({});
  video = document.createElement('video');
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve('WEBVTT\n'),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
      }),
    ),
  );
  URL.createObjectURL = () => 'blob:subtitles';
  URL.revokeObjectURL = () => {};
});

afterEach(() => vi.unstubAllGlobals());

const fetched = () => (fetch as unknown as { mock: { calls: [string][] } }).mock.calls.map(([url]) => url);

describe('starting a video', () => {
  it('plays the file as it is when the server says the browser can', async () => {
    const { result } = await start();
    expect(asked()).toHaveLength(1);
    expect(asked()[0]).toMatchObject({ EnableDirectPlay: true, MaxStreamingBitrate: 120_000_000 });
    expect(video.src).toContain('/Videos/item-1/stream?static=true');
    expect(result.current.stream).toMatchObject({
      method: 'DirectPlay',
      isHls: false,
      playSessionId: 'play-1',
      audioIndex: 1,
      subIndex: -1,
    });
    expect(result.current.duration).toBe(6000);
    expect(m.audioPause).toHaveBeenCalled();
  });

  it('continues where the video was left, or where the caller says', async () => {
    await start({ item: item({ UserData: { PlaybackPositionTicks: 900_000_000 } as BaseItemDto['UserData'] }) });
    fire('loadedmetadata');
    expect(video.currentTime).toBe(90);

    video = document.createElement('video');
    await start({
      item: item({ UserData: { PlaybackPositionTicks: 900_000_000 } as BaseItemDto['UserData'] }),
      navState: { fromStart: true },
    });
    fire('loadedmetadata');
    expect(video.currentTime).toBe(0);
  });

  it('reports the start once the picture moves, then pauses, and the stop when the player closes', async () => {
    const { result, unmount } = await start();
    fire('playing');
    expect(result.current.playing).toBe(true);
    expect(result.current.loading).toBe(false);
    fire('playing');
    fire('pause');
    expect(result.current.playing).toBe(false);
    unmount();
    expect(reports()).toEqual(['POST /Sessions/Playing', 'POST /Sessions/Playing/Progress', 'POST /Sessions/Playing/Stopped']);
  });

  it('feeds a transcode to hls.js from the right position, and tells the server to stop transcoding afterwards', async () => {
    serverAnswers(TRANSCODE);
    const { result, unmount } = await start({
      item: item({ UserData: { PlaybackPositionTicks: 300_000_000 } as BaseItemDto['UserData'] }),
    });
    expect(result.current.stream).toMatchObject({
      method: 'Transcode',
      isHls: true,
      nativeHls: false,
      transcodeReasons: ['ContainerNotSupported', 'AudioCodecNotSupported'],
    });
    expect(m.hls).toHaveLength(1);
    expect(m.hls[0]).toMatchObject({ url: TRANSCODE.TranscodingUrl, config: { startPosition: 30 } });
    unmount();
    expect(m.hls[0].destroyed).toBe(true);
    expect(reports()).toContain('DELETE /Videos/ActiveEncodings');
  });

  it("gives a transcode to Safari's own player, and to hls.js once an audio delay is set", async () => {
    m.nativeHls = true;
    serverAnswers(TRANSCODE);
    const { result, rerender } = await start();
    expect(result.current.stream?.nativeHls).toBe(true);
    expect(video.src).toContain('master.m3u8');
    expect(m.hls).toHaveLength(0);

    rerender({ audioDelayed: true });
    await settle();
    expect(asked()).toHaveLength(2);
    expect(result.current.stream?.nativeHls).toBe(false);
    expect(m.hls).toHaveLength(1);
  });

  it("falls back to hls.js when Safari's own player fails", async () => {
    m.nativeHls = true;
    serverAnswers(TRANSCODE);
    const { result } = await start();
    Object.defineProperty(video, 'error', { configurable: true, value: { code: 3, message: 'decode' } });
    fire('error');
    await settle();
    expect(result.current.stream?.nativeHls).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('asks for a transcode when the file turns out not to play, and shows the error if that fails too', async () => {
    // Without hls.js the transcode goes to the browser's own player, whose errors arrive on the video element.
    m.hlsJs = false;
    serverAnswers({}, TRANSCODE);
    const { result } = await start();
    Object.defineProperty(video, 'error', { configurable: true, value: { code: 4, message: '' } });
    fire('error');
    await settle();
    expect(asked()).toHaveLength(2);
    expect(asked()[1].EnableDirectPlay).toBe(false);
    expect(result.current.stream?.method).toBe('Transcode');
    expect(result.current.error).toBeNull();
    fire('error');
    await settle();
    expect(asked()).toHaveLength(2);
    expect(result.current.error).toBe('The video could not be played (code 4).');
  });

  it("shows the server's reason when it refuses", async () => {
    m.post.mockResolvedValue({ MediaSources: [], ErrorCode: 'NotAllowed' });
    const { result } = await start();
    expect(result.current.error).toBe('You are not allowed to play this item.');
    expect(result.current.loading).toBe(false);

    m.post.mockResolvedValue({ MediaSources: [] });
    act(() => result.current.retry());
    await settle();
    expect(result.current.error).toBe('No playable media source was found.');
  });

  it('says so when the server has neither a file nor a transcode to offer', async () => {
    serverAnswers({ SupportsDirectPlay: false });
    const { result } = await start();
    expect(result.current.error).toBe('This item can’t be played in this browser, and the server could not provide a transcode.');
  });
});

describe('switching while playing', () => {
  it('asks for a new stream at the same position for another audio track or quality, and keeps the quality', async () => {
    const { result } = await start();
    video.currentTime = 123;
    act(() => result.current.changeAudio(7));
    await settle();
    expect(asked()[1]).toMatchObject({ AudioStreamIndex: 7 });
    fire('loadedmetadata');
    expect(video.currentTime).toBe(123);

    act(() => result.current.changeQuality(4_000_000));
    await settle();
    expect(asked()[2]).toMatchObject({ MaxStreamingBitrate: 4_000_000, AudioStreamIndex: 7 });
    expect(localStorage.getItem('jellyplex.maxBitrate')).toBe('4000000');
    expect(result.current.maxBitrate).toBe(4_000_000);
  });

  it('does nothing when the same track is chosen again', async () => {
    const { result } = await start();
    act(() => result.current.changeAudio(1));
    act(() => result.current.changeSubtitle(-1));
    await settle();
    expect(asked()).toHaveLength(1);
  });

  it('can be asked to transcode after an error', async () => {
    const { result } = await start();
    act(() => result.current.retryTranscode());
    await settle();
    expect(asked()[1].EnableDirectPlay).toBe(false);
  });
});

describe('subtitles', () => {
  it('loads text subtitles next to the video and switches them off again without a new stream', async () => {
    const { result } = await start();
    act(() => result.current.changeSubtitle(2));
    await settle();
    expect(fetched()).toEqual(['/Videos/item-1/source-1/Subtitles/2/0/Stream.vtt']);
    expect(result.current.subtitleKind).toBe('text');
    expect(result.current.textSubtitles).toBe(true);
    expect(video.querySelectorAll('track')).toHaveLength(1);
    expect(result.current.stream?.subIndex).toBe(2);

    act(() => result.current.changeSubtitle(-1));
    await settle();
    expect(result.current.subtitleKind).toBe('none');
    expect(video.querySelectorAll('track')).toHaveLength(0);
    expect(asked()).toHaveLength(1);
  });

  it('starts with the subtitles the caller chose', async () => {
    const { result } = await start({ navState: { subtitleStreamIndex: 2 } });
    expect(asked()[0].SubtitleStreamIndex).toBe(2);
    expect(result.current.subtitleKind).toBe('text');
  });

  it('draws styled, PGS and DVD subtitles itself', async () => {
    const { result } = await start();
    act(() => result.current.changeSubtitle(3));
    await settle();
    expect(result.current.subtitleKind).toBe('ass');
    expect(m.ass).toHaveBeenCalledWith(expect.objectContaining({ content: 'WEBVTT\n', delay: 0 }));

    act(() => result.current.changeSubtitle(4));
    await settle();
    expect(result.current.subtitleKind).toBe('pgs');

    act(() => result.current.changeSubtitle(5));
    await settle();
    expect(result.current.subtitleKind).toBe('vobsub');
    // DVD subtitles are read out of the video file: nothing is fetched from the subtitle address.
    expect(fetched()).toHaveLength(2);
    expect(m.vobSub).toHaveBeenCalledWith(expect.objectContaining({ streamIndex: 5, position: 0 }));
    expect(asked()).toHaveLength(1);
  });

  it('only leaves DVD subtitles in the file for Matroska files', async () => {
    await start();
    expect(asked()[0].DeviceProfile).toMatchObject({ subtitles: 'canvas', images: true, vobSub: true });
    video = document.createElement('video');
    await start({ item: item({ MediaSources: [source({ Container: 'mp4' })] }) });
    expect(asked()[1].DeviceProfile.vobSub).toBe(false);
  });

  it('shows styled subtitles as plain text when their styling is switched off', async () => {
    m.styled = false;
    const { result } = await start();
    act(() => result.current.changeSubtitle(3));
    await settle();
    expect(fetched()).toEqual(['/Videos/item-1/source-1/Subtitles/3/0/Stream.vtt']);
    expect(result.current.subtitleKind).toBe('text');
    expect(m.ass).not.toHaveBeenCalled();
  });

  it('shows styled subtitles as plain text when drawing them fails, without a new stream', async () => {
    m.ass.mockRejectedValue(new Error('no WebAssembly'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = await start();
    act(() => result.current.changeSubtitle(3));
    await settle();
    await settle();
    expect(fetched()).toEqual(['/Videos/item-1/source-1/Subtitles/3/0/Stream.ass', '/Videos/item-1/source-1/Subtitles/3/0/Stream.vtt']);
    expect(result.current.subtitleKind).toBe('text');
    expect(asked()).toHaveLength(1);
    warn.mockRestore();
  });

  it('has the server burn DVD subtitles in when they cannot be read out of the file', async () => {
    m.vobSub.mockRejectedValue(new Error('no index'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = await start();
    serverAnswers({ ...TRANSCODE, MediaStreams: STREAMS.map((s) => (s.Index === 5 ? { ...s, DeliveryMethod: 'Encode' as const } : s)) });
    act(() => result.current.changeSubtitle(5));
    await settle();
    await settle();
    expect(asked()).toHaveLength(1);
    expect(asked()[0]).toMatchObject({ SubtitleStreamIndex: 5, DeviceProfile: { vobSub: false } });
    expect(result.current.stream).toMatchObject({ burnedSub: true, subIndex: 5 });
    expect(result.current.subtitleKind).toBe('none');
    warn.mockRestore();
  });

  it('asks for a new stream for subtitles the server has to burn in', async () => {
    serverAnswers({
      MediaStreams: STREAMS.map((s) => (s.Index === 4 ? { ...s, DeliveryMethod: 'Encode' as const, DeliveryUrl: null } : s)),
    });
    const { result } = await start();
    act(() => result.current.changeSubtitle(4));
    await settle();
    expect(asked()).toHaveLength(2);
    expect(result.current.stream?.burnedSub).toBe(true);
  });
});

describe('when the picture is shown elsewhere', () => {
  it('has image subtitles burned in for picture-in-picture, and draws them again afterwards', async () => {
    const { result, rerender } = await start({ navState: { subtitleStreamIndex: 4 } });
    expect(result.current.subtitleKind).toBe('pgs');

    rerender({ navState: { subtitleStreamIndex: 4 }, inPip: true });
    await settle();
    expect(asked()).toHaveLength(2);
    expect(asked()[1].DeviceProfile.subtitles).toBe('burn');
    expect(result.current.stream?.subtitleMode).toBe('burn');

    rerender({ navState: { subtitleStreamIndex: 4 }, inPip: false });
    await settle();
    expect(asked()).toHaveLength(3);
    expect(asked()[2].DeviceProfile.subtitles).toBe('canvas');
  });

  it('leaves plain text subtitles alone in picture-in-picture', async () => {
    const { rerender } = await start({ navState: { subtitleStreamIndex: 2 } });
    rerender({ navState: { subtitleStreamIndex: 2 }, inPip: true });
    await settle();
    expect(asked()).toHaveLength(1);
  });

  it('shows styled subtitles as text in a picture-in-picture window that draws text, on the same stream', async () => {
    m.chromium = false;
    const { result, rerender } = await start({ navState: { subtitleStreamIndex: 3 } });
    expect(result.current.subtitleKind).toBe('ass');
    rerender({ navState: { subtitleStreamIndex: 3 }, inPip: true });
    await settle();
    expect(asked()).toHaveLength(1);
    expect(result.current.subtitleKind).toBe('text');
    expect(fetched().at(-1)).toBe('/Videos/item-1/source-1/Subtitles/3/0/Stream.vtt');

    rerender({ navState: { subtitleStreamIndex: 3 }, inPip: false });
    await settle();
    expect(result.current.subtitleKind).toBe('ass');
    expect(asked()).toHaveLength(1);
  });

  it("has every subtitle burned in for AirPlay, through Safari's own player", async () => {
    serverAnswers({});
    const { result, rerender } = await start({ navState: { subtitleStreamIndex: 2 } });
    serverAnswers({
      ...TRANSCODE,
      MediaStreams: STREAMS.map((s) => (s.Type === 'Subtitle' ? { ...s, DeliveryMethod: 'Encode' as const } : s)),
    });
    rerender({ navState: { subtitleStreamIndex: 2 }, airPlay: true });
    await settle();
    expect(asked()[0].DeviceProfile.subtitles).toBe('burn');
    expect(result.current.stream).toMatchObject({ burnedSub: true, nativeHls: true, subtitleMode: 'burn' });
    expect(m.hls).toHaveLength(0);
  });
});
