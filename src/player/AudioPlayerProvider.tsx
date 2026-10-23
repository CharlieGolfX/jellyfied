import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import type { JellyfinApi } from '@/api/client';
import type { BaseItemDto } from '@/api/types';
import { generateId } from '@/api/device';
import { secondsToTicks, ticksToSeconds } from '@/lib/format';
import { reportPlaybackProgress, reportPlaybackStart, reportPlaybackStopped } from './reporting';
import { getCastTarget, sendRemotePlay, type RemotePlayCommand } from './castTarget';
import { castPlay, getChromecast } from './chromecast';
import { usePlaytimeTracker } from './usePlaytimeTracker';
import type { SyncPlayManager, SyncPlayQueueState } from './syncplay';
import { VOLUME_KEY } from './video/shared';
import { readString, writeString } from '@/lib/storage';

export type RepeatMode = 'off' | 'all' | 'one';

interface AudioPlayerStatus {
  queue: BaseItemDto[];
  index: number;
  current: BaseItemDto | null;
  isPlaying: boolean;
  isLoading: boolean;
  duration: number;
  volume: number;
  muted: boolean;
  repeat: RepeatMode;
  /** Playing along with a SyncPlay group: the group's queue, and the group decides what plays. */
  inGroup: boolean;
  /** The group's queue is shuffled (in a group, shuffling is a mode rather than a one-off). */
  shuffled: boolean;
}

/** What the player can be asked to do. These never change, so using them doesn't re-render anything. */
interface AudioPlayerActions {
  /** Where in the track the player is, in seconds, right now. */
  getTime: () => number;
  play: (items: BaseItemDto[], startIndex?: number) => void;
  /**
   * Plays a SyncPlay group's queue from `index`, at `startTicks`, following the group: playing,
   * pausing and seeking go through it, and at the end of a track it moves on for everyone.
   */
  playForGroup: (manager: SyncPlayManager, items: BaseItemDto[], index: number, startTicks: number, playlistItemId: string) => void;
  /** Stops following the group; what is loaded stays, as this browser's own. */
  leaveGroup: () => void;
  /** The group's queue changed: songs added or removed, shuffled, or repeat changed. */
  updateGroupQueue: (items: BaseItemDto[], state: SyncPlayQueueState) => void;
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

type AudioPlayerState = AudioPlayerStatus & AudioPlayerActions;

// Three parts, so that what only needs to start music doesn't re-render whenever the player does,
// and only what shows the position re-renders with it (a few times a second while music plays).
const AudioPlayerContext = createContext<AudioPlayerState | null>(null);
const AudioActionsContext = createContext<AudioPlayerActions | null>(null);
const AudioTimeContext = createContext(0);

/** The group this player follows, and the queue entry it is on. */
interface GroupPlayback {
  manager: SyncPlayManager;
  playlistItemId: string;
  /** Where in the track the group is, in seconds, when it is loaded. */
  start: number;
}

function supportedContainers(): string {
  const a = document.createElement('audio');
  const can = (type: string) => a.canPlayType(type).replace(/no/, '') !== '';
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

function readVolume(): number {
  const v = Number(readString(VOLUME_KEY));
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : 1;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const { api } = useAuth();
  // One audio element for the life of the app.
  const [audioElement] = useState(() => (typeof Audio === 'undefined' ? null : Object.assign(new Audio(), { preload: 'auto' })));
  const audioRef = useRef<HTMLAudioElement | null>(audioElement);

  const [queue, setQueue] = useState<BaseItemDto[]>([]);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(readVolume);
  const [muted, setMuted] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const [group, setGroup] = useState<GroupPlayback | null>(null);
  const [shuffled, setShuffled] = useState(false);
  const shuffledRef = useRef(shuffled);
  useLayoutEffect(() => {
    shuffledRef.current = shuffled;
  });

  const current = queue[index] ?? null;
  // Time actually played, for the account's stats.
  usePlaytimeTracker(audioRef, current?.Id, 'audio', current?.RunTimeTicks ? ticksToSeconds(current.RunTimeTicks) : undefined);

  // Mutable refs so event handlers always see fresh state.
  const stateRef = useRef({ queue, index, repeat, api, group });
  useLayoutEffect(() => {
    stateRef.current = { queue, index, repeat, api, group };
  });
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
  // Keyed on the track's id: the same track arriving as a new object (a refreshed list) must not
  // restart it. Loading a track resets what the player shows, which is this effect's whole job.
  // oxlint-disable react/set-state-in-effect, react/exhaustive-effect-dependencies, react-hooks/exhaustive-deps
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
    const following = stateRef.current.group;
    if (following) {
      // The group's follower starts it, together with everyone, from where the group is.
      if (following.start > 0) {
        audio.addEventListener('loadedmetadata', () => (audio.currentTime = following.start), { once: true });
      }
    } else audio.play().catch(() => setIsPlaying(false));
    void reportPlaybackStart(api, {
      ItemId: current.Id,
      PlaySessionId: playSessionId,
      PositionTicks: 0,
      PlayMethod: 'DirectPlay',
      IsPaused: false,
      NowPlayingQueue: stateRef.current.queue.map((q) => ({ Id: q.Id })),
    });
  }, [currentId, api]);
  // oxlint-enable react/set-state-in-effect, react/exhaustive-effect-dependencies, react-hooks/exhaustive-deps

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
      const { queue: q, index: i, repeat: r, group: g } = stateRef.current;
      if (g && r === 'one') {
        g.manager.restart();
        return;
      }
      if (g) {
        // The group moves on together; at the end of its queue it stops.
        if (!g.manager.requestNext()) {
          reportStop();
          setIsPlaying(false);
        }
        return;
      }
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
    // The id is listed next to the track so a changed track always starts a fresh reporting timer.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [currentId, api, current]);

  // Report stop when the tab closes.
  useEffect(() => {
    const onUnload = () => reportStop(true);
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, [reportStop]);

  // Stop when logging out.
  if (!api && queue.length > 0) {
    setQueue([]);
    setIndex(0);
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
    writeString(VOLUME_KEY, String(volume));
  }, [volume, muted]);

  // SyncPlay: hand the audio element to the group for as long as this track plays along.
  useEffect(() => {
    const audio = audioRef.current;
    if (!group || !audio) return;
    return group.manager.attach(audio, group.playlistItemId);
  }, [group]);

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

  const play = useCallback(
    (items: BaseItemDto[], startIndex = 0) => {
      if (!items.length) return;
      if (sendToCastTarget(items, 'PlayNow', startIndex)) return;
      setGroup(null);
      const audio = audioRef.current;
      const sameTrack = stateRef.current.queue[stateRef.current.index]?.Id === items[startIndex]?.Id;
      setQueue(items);
      setIndex(startIndex);
      if (sameTrack && audio) {
        audio.currentTime = 0;
        void audio.play();
      }
    },
    [sendToCastTarget],
  );

  const playForGroup = useCallback(
    (manager: SyncPlayManager, items: BaseItemDto[], startIndex: number, startTicks: number, playlistItemId: string) => {
      const start = ticksToSeconds(startTicks);
      const audio = audioRef.current;
      const sameTrack = stateRef.current.queue[stateRef.current.index]?.Id === items[startIndex]?.Id;
      setGroup({ manager, playlistItemId, start });
      setQueue(items);
      setIndex(startIndex);
      // The same song again (repeated in the queue, or the group starting over): only move to the spot.
      if (sameTrack && audio) audio.currentTime = start;
    },
    [],
  );

  const leaveGroup = useCallback(() => {
    setGroup(null);
    setShuffled(false);
  }, []);

  const updateGroupQueue = useCallback((items: BaseItemDto[], state: SyncPlayQueueState) => {
    if (!stateRef.current.group) return;
    const playing = state.queue[state.index];
    setQueue(items);
    // Where the playing song is now; the song itself doesn't change here.
    const at = items.findIndex((i) => i.Id === playing);
    if (at >= 0) setIndex(at);
    setRepeat(state.repeat);
    setShuffled(state.shuffled);
  }, []);

  const enqueue = useCallback(
    (items: BaseItemDto[]) => {
      const g = stateRef.current.group;
      if (g) {
        g.manager.enqueue(items.map((i) => i.Id));
        return;
      }
      if (sendToCastTarget(items, 'PlayLast')) return;
      setQueue((q) => [...q, ...items]);
    },
    [sendToCastTarget],
  );

  const playNext = useCallback(
    (items: BaseItemDto[]) => {
      const g = stateRef.current.group;
      if (g) {
        g.manager.enqueue(
          items.map((i) => i.Id),
          true,
        );
        return;
      }
      if (sendToCastTarget(items, 'PlayNext')) return;
      setQueue((q) => {
        const i = stateRef.current.index;
        if (q.length === 0) return items;
        return [...q.slice(0, i + 1), ...items, ...q.slice(i + 1)];
      });
    },
    [sendToCastTarget],
  );

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }, []);

  const pause = useCallback(() => audioRef.current?.pause(), []);
  const resume = useCallback(() => {
    const audio = audioRef.current;
    if (audio?.src && audio.paused) void audio.play();
  }, []);
  const getTime = useCallback(() => audioRef.current?.currentTime ?? 0, []);

  const next = useCallback(() => {
    const { queue: q, index: i, repeat: r, group: g } = stateRef.current;
    if (g) {
      g.manager.requestNext();
      return;
    }
    if (i + 1 < q.length) setIndex(i + 1);
    else if (r === 'all' && q.length > 1) setIndex(0);
  }, []);

  const previous = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const { index: i, group: g } = stateRef.current;
    if (g) {
      if (!g.manager.requestPrevious() && audio) audio.currentTime = 0;
      return;
    }
    if (i > 0) setIndex(i - 1);
    else if (audio) audio.currentTime = 0;
  }, []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, seconds);
    setCurrentTime(audio.currentTime);
  }, []);

  const jumpTo = useCallback((i: number) => {
    const g = stateRef.current.group;
    if (g) g.manager.jumpTo(i);
    else setIndex(i);
  }, []);

  // In a group, removing, shuffling and repeating are the group's: the server sends the result back.
  const removeAt = useCallback((i: number) => {
    const { queue: q, index: cur, group: g } = stateRef.current;
    if (g) {
      g.manager.remove(i);
      return;
    }
    const nextQueue = q.filter((_, idx) => idx !== i);
    setQueue(nextQueue);
    if (i < cur) setIndex(cur - 1);
    else if (i === cur) setIndex(Math.max(0, Math.min(cur, nextQueue.length - 1)));
  }, []);

  const stop = useCallback(() => {
    setGroup(null);
    setQueue([]);
    setIndex(0);
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(Math.min(1, Math.max(0, v)));
    setMuted(false);
  }, []);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);
  const cycleRepeat = useCallback(() => {
    const { repeat: r, group: g } = stateRef.current;
    const nextMode: RepeatMode = r === 'off' ? 'all' : r === 'all' ? 'one' : 'off';
    if (g) g.manager.setRepeat(nextMode);
    else setRepeat(nextMode);
  }, []);

  const shuffleQueue = useCallback(() => {
    const { queue: q, index: i, group: g } = stateRef.current;
    if (g) {
      g.manager.setShuffle(!shuffledRef.current);
      return;
    }
    if (q.length < 3) return;
    const head = q.slice(0, i + 1);
    const tail = shuffle(q.slice(i + 1));
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
    // Not a toggle: after a Bluetooth reconnect the system's idea of the state can be the wrong way round.
    ms.setActionHandler('play', resume);
    ms.setActionHandler('pause', pause);
    ms.setActionHandler('nexttrack', next);
    ms.setActionHandler('previoustrack', previous);
    ms.setActionHandler('seekto', (d) => d.seekTime !== undefined && seek(d.seekTime));
  }, [current, api, resume, pause, next, previous, seek]);

  const actions = useMemo<AudioPlayerActions>(
    () => ({
      getTime,
      play,
      playForGroup,
      leaveGroup,
      updateGroupQueue,
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
      getTime,
      play,
      playForGroup,
      leaveGroup,
      updateGroupQueue,
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

  const inGroup = group !== null;
  const value = useMemo<AudioPlayerState>(
    () => ({ ...actions, queue, index, current, isPlaying, isLoading, duration, volume, muted, repeat, inGroup, shuffled }),
    [actions, queue, index, current, isPlaying, isLoading, duration, volume, muted, repeat, inGroup, shuffled],
  );

  return (
    <AudioActionsContext.Provider value={actions}>
      <AudioPlayerContext.Provider value={value}>
        <AudioTimeContext.Provider value={currentTime}>{children}</AudioTimeContext.Provider>
      </AudioPlayerContext.Provider>
    </AudioActionsContext.Provider>
  );
}

export function useAudioPlayer(): AudioPlayerState {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx) throw new Error('useAudioPlayer must be used inside AudioPlayerProvider');
  return ctx;
}

/** Only what the player can do: for starting music and the like, without re-rendering as it plays. */
export function useAudioActions(): AudioPlayerActions {
  const ctx = useContext(AudioActionsContext);
  if (!ctx) throw new Error('useAudioActions must be used inside AudioPlayerProvider');
  return ctx;
}

/** The position in the track, in seconds. Changes a few times a second while music plays. */
export function useAudioTime(): number {
  return useContext(AudioTimeContext);
}
