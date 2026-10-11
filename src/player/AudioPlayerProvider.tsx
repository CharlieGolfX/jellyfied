import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/auth/AuthProvider';
import type { JellyfinApi } from '@/api/client';
import type { BaseItemDto } from '@/api/types';
import { generateId } from '@/api/device';
import { secondsToTicks, ticksToSeconds } from '@/lib/format';
import { reportPlaybackProgress, reportPlaybackStart, reportPlaybackStopped } from './reporting';
import { getCastTarget, sendRemotePlay, type RemotePlayCommand } from './castTarget';
import { castPlay, getChromecast } from './chromecast';

export type RepeatMode = 'off' | 'all' | 'one';

interface AudioPlayerState {
  queue: BaseItemDto[];
  index: number;
  current: BaseItemDto | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  repeat: RepeatMode;
  play: (items: BaseItemDto[], startIndex?: number) => void;
  enqueue: (items: BaseItemDto[]) => void;
  playNext: (items: BaseItemDto[]) => void;
  toggle: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  jumpTo: (index: number) => void;
  removeAt: (index: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  cycleRepeat: () => void;
  shuffleQueue: () => void;
  stop: () => void;
}

const AudioPlayerContext = createContext<AudioPlayerState | null>(null);

function supportedContainers(): string {
  const a = document.createElement('audio');
  const can = (t: string) => a.canPlayType(t).replace(/no/, '') !== '';
  const list: string[] = [];
  if (can('audio/webm; codecs="opus"')) list.push('opus', 'webm|opus');
  list.push('mp3');
  if (can('audio/mp4; codecs="mp4a.40.2"')) list.push('aac', 'm4a|aac', 'm4b|aac', 'mp4|aac');
  if (can('audio/flac')) list.push('flac');
  if (can('audio/webm; codecs="vorbis"')) list.push('webma', 'webm|webma');
  if (can('audio/wav')) list.push('wav');
  if (can('audio/ogg; codecs="vorbis"')) list.push('ogg');
  return list.join(',');
}

function streamUrl(api: JellyfinApi, item: BaseItemDto, playSessionId: string): string {
  return api.url(
    `/Audio/${item.Id}/universal`,
    {
      UserId: api.userId,
      DeviceId: api.deviceId,
      MaxStreamingBitrate: 140_000_000,
      Container: supportedContainers(),
      TranscodingContainer: 'mp3',
      TranscodingProtocol: 'http',
      AudioCodec: 'mp3',
      PlaySessionId: playSessionId,
      EnableRedirection: true,
      EnableRemoteMedia: false,
    },
    true,
  );
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const { api } = useAuth();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (!audioRef.current && typeof Audio !== 'undefined') {
    audioRef.current = new Audio();
    audioRef.current.preload = 'auto';
  }

  const [queue, setQueue] = useState<BaseItemDto[]>([]);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(() => {
    const v = Number(localStorage.getItem('jellyplex.volume'));
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 1;
  });
  const [muted, setMuted] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');

  const current = queue[index] ?? null;

  // Mutable refs so event handlers always see fresh state.
  const stateRef = useRef({ queue, index, repeat, api });
  stateRef.current = { queue, index, repeat, api };
  const sessionRef = useRef<{ itemId: string; playSessionId: string } | null>(null);

  const reportStop = useCallback((keepalive = false) => {
    const audio = audioRef.current;
    const s = sessionRef.current;
    const a = stateRef.current.api;
    if (!s || !a || !audio) return;
    sessionRef.current = null;
    void reportPlaybackStopped(
      a,
      { ItemId: s.itemId, PlaySessionId: s.playSessionId, PositionTicks: secondsToTicks(audio.currentTime || 0) },
      keepalive,
    );
  }, []);

  // Load the current track whenever it changes.
  const currentId = current?.Id;
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!current || !api) {
      reportStop();
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }
    reportStop();
    const playSessionId = generateId();
    sessionRef.current = { itemId: current.Id, playSessionId };
    audio.src = streamUrl(api, current, playSessionId);
    setCurrentTime(0);
    setDuration(ticksToSeconds(current.RunTimeTicks));
    setIsLoading(true);
    audio.play().catch(() => setIsPlaying(false));
    void reportPlaybackStart(api, {
      ItemId: current.Id,
      PlaySessionId: playSessionId,
      PositionTicks: 0,
      PlayMethod: 'DirectPlay',
      IsPaused: false,
      NowPlayingQueue: stateRef.current.queue.map((q) => ({ Id: q.Id })),
    });
  }, [currentId, api]);

  // Wire up element events once.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onDuration = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
    };
    const onPlay = () => setIsPlaying(true);
    const onPlaying = () => {
      setIsPlaying(true);
      setIsLoading(false);
    };
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsLoading(true);
    const onEnded = () => {
      const { queue: q, index: i, repeat: r } = stateRef.current;
      if (r === 'one') {
        audio.currentTime = 0;
        void audio.play();
        return;
      }
      if (i + 1 < q.length) setIndex(i + 1);
      else if (r === 'all' && q.length > 0) {
        if (q.length === 1) {
          audio.currentTime = 0;
          void audio.play();
        } else setIndex(0);
      } else {
        reportStop();
        setIsPlaying(false);
      }
    };
    const onError = () => {
      setIsLoading(false);
      setIsPlaying(false);
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('durationchange', onDuration);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('durationchange', onDuration);
      audio.removeEventListener('loadedmetadata', onDuration);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [reportStop]);

  // Periodic progress reports.
  useEffect(() => {
    if (!current || !api) return;
    const audio = audioRef.current!;
    const send = (eventName?: string) => {
      const s = sessionRef.current;
      if (!s) return;
      void reportPlaybackProgress(api, {
        ItemId: s.itemId,
        PlaySessionId: s.playSessionId,
        PositionTicks: secondsToTicks(audio.currentTime || 0),
        IsPaused: audio.paused,
        IsMuted: audio.muted,
        VolumeLevel: Math.round(audio.volume * 100),
        PlayMethod: 'DirectPlay',
        EventName: eventName,
      });
    };
    const timer = window.setInterval(() => {
      if (!audio.paused) send('timeupdate');
    }, 10_000);
    const onPause = () => send('pause');
    const onPlay = () => send('unpause');
    audio.addEventListener('pause', onPause);
    audio.addEventListener('play', onPlay);
    return () => {
      window.clearInterval(timer);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('play', onPlay);
    };
  }, [currentId, api, current]);

  // Report stop when the tab closes.
  useEffect(() => {
    const onUnload = () => reportStop(true);
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, [reportStop]);

  // Stop when logging out.
  useEffect(() => {
    if (!api) {
      setQueue([]);
      setIndex(0);
    }
  }, [api]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
    try {
      localStorage.setItem('jellyplex.volume', String(volume));
    } catch {
      /* ignore */
    }
  }, [volume, muted]);

  /** While "Play on" is active, music goes to the other device instead of this browser's queue. */
  const sendToCastTarget = useCallback((items: BaseItemDto[], command: RemotePlayCommand, startIndex = 0): boolean => {
    const target = getCastTarget();
    const a = stateRef.current.api;
    if (a && getChromecast().status === 'connected') {
      void castPlay({ api: a, serverId: items[0]?.ServerId ?? '' }, items, {
        shuffle: command === 'PlayShuffle',
        queue: command === 'PlayNext' || command === 'PlayLast' ? command : undefined,
        startIndex,
      }).catch(() => {});
      return true;
    }
    if (!target || !a) return false;
    void sendRemotePlay(
      a,
      target,
      items.map((i) => i.Id),
      { command, startIndex },
    ).catch(() => {});
    return true;
  }, []);

  const play = useCallback((items: BaseItemDto[], startIndex = 0) => {
    if (!items.length) return;
    if (sendToCastTarget(items, 'PlayNow', startIndex)) return;
    const audio = audioRef.current;
    const sameTrack = stateRef.current.queue[stateRef.current.index]?.Id === items[startIndex]?.Id;
    setQueue(items);
    setIndex(startIndex);
    if (sameTrack && audio) {
      audio.currentTime = 0;
      void audio.play();
    }
  }, [sendToCastTarget]);

  const enqueue = useCallback((items: BaseItemDto[]) => {
    if (sendToCastTarget(items, 'PlayLast')) return;
    setQueue((q) => [...q, ...items]);
  }, [sendToCastTarget]);

  const playNext = useCallback((items: BaseItemDto[]) => {
    if (sendToCastTarget(items, 'PlayNext')) return;
    setQueue((q) => {
      const i = stateRef.current.index;
      if (q.length === 0) return items;
      return [...q.slice(0, i + 1), ...items, ...q.slice(i + 1)];
    });
  }, [sendToCastTarget]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }, []);

  const pause = useCallback(() => audioRef.current?.pause(), []);

  const next = useCallback(() => {
    const { queue: q, index: i, repeat: r } = stateRef.current;
    if (i + 1 < q.length) setIndex(i + 1);
    else if (r === 'all' && q.length > 1) setIndex(0);
  }, []);

  const previous = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const { index: i } = stateRef.current;
    if (i > 0) setIndex(i - 1);
    else if (audio) audio.currentTime = 0;
  }, []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, seconds);
    setCurrentTime(audio.currentTime);
  }, []);

  const jumpTo = useCallback((i: number) => setIndex(i), []);

  const removeAt = useCallback((i: number) => {
    const { queue: q, index: cur } = stateRef.current;
    const nextQueue = q.filter((_, idx) => idx !== i);
    setQueue(nextQueue);
    if (i < cur) setIndex(cur - 1);
    else if (i === cur) setIndex(Math.min(cur, nextQueue.length - 1));
  }, []);

  const stop = useCallback(() => {
    setQueue([]);
    setIndex(0);
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(Math.min(1, Math.max(0, v)));
    setMuted(false);
  }, []);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);
  const cycleRepeat = useCallback(
    () => setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')),
    [],
  );

  const shuffleQueue = useCallback(() => {
    const { queue: q, index: i } = stateRef.current;
    if (q.length < 3) return;
    const head = q.slice(0, i + 1);
    const tail = shuffled(q.slice(i + 1));
    setQueue([...head, ...tail]);
  }, []);

  // OS media controls.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    if (!current || !api) {
      ms.metadata = null;
      return;
    }
    const artId = current.AlbumId && current.AlbumPrimaryImageTag ? current.AlbumId : current.Id;
    const artTag = current.AlbumId && current.AlbumPrimaryImageTag ? current.AlbumPrimaryImageTag : current.ImageTags?.Primary;
    ms.metadata = new MediaMetadata({
      title: current.Name ?? '',
      artist: current.Artists?.join(', ') ?? current.AlbumArtist ?? '',
      album: current.Album ?? '',
      artwork: artTag ? [{ src: api.imageUrl(artId, 'Primary', { tag: artTag, maxWidth: 512 }), sizes: '512x512' }] : [],
    });
    ms.setActionHandler('play', toggle);
    ms.setActionHandler('pause', toggle);
    ms.setActionHandler('nexttrack', next);
    ms.setActionHandler('previoustrack', previous);
    ms.setActionHandler('seekto', (d) => d.seekTime !== undefined && seek(d.seekTime));
  }, [current, api, toggle, next, previous, seek]);

  const value = useMemo<AudioPlayerState>(
    () => ({
      queue,
      index,
      current,
      isPlaying,
      isLoading,
      currentTime,
      duration,
      volume,
      muted,
      repeat,
      play,
      enqueue,
      playNext,
      toggle,
      pause,
      next,
      previous,
      seek,
      jumpTo,
      removeAt,
      setVolume,
      toggleMute,
      cycleRepeat,
      shuffleQueue,
      stop,
    }),
    [
      queue,
      index,
      current,
      isPlaying,
      isLoading,
      currentTime,
      duration,
      volume,
      muted,
      repeat,
      play,
      enqueue,
      playNext,
      toggle,
      pause,
      next,
      previous,
      seek,
      jumpTo,
      removeAt,
      setVolume,
      toggleMute,
      cycleRepeat,
      shuffleQueue,
      stop,
    ],
  );

  return <AudioPlayerContext.Provider value={value}>{children}</AudioPlayerContext.Provider>;
}

export function useAudioPlayer(): AudioPlayerState {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx) throw new Error('useAudioPlayer must be used inside AudioPlayerProvider');
  return ctx;
}
