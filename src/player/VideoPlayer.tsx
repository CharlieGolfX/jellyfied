import clsx from 'clsx';
import Hls, { ErrorTypes, Events } from 'hls.js';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ListVideo,
  Maximize,
  Maximize2,
  Minimize,
  Minus,
  Moon,
  Pause,
  PictureInPicture2,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Scaling,
  Settings2,
  SkipForward,
  Subtitles,
  Users,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { generateId } from '@/api/device';
import { cardImage, imageSrc } from '@/api/images';
import { useItem, useMediaSegments } from '@/api/queries';
import type { BaseItemDto, ItemsResult, MediaSourceInfo, MediaStream, PlaybackInfoResponse, TrickplayInfo } from '@/api/types';
import { useApi, useCurrentUser, useSession } from '@/auth/AuthProvider';
import { Img } from '@/components/ui/States';
import { Spinner } from '@/components/ui/Spinner';
import { errorMessage, useToast } from '@/components/ui/Toast';
import { episodeLabel, formatClock, secondsToTicks, ticksToSeconds } from '@/lib/format';
import { formatTimeOfDay, useTimeFormat } from '@/lib/timeFormat';
import { registerActiveVideo, type ActiveVideo } from './activePlayer';
import {
  AUDIO_DELAY_STEP,
  audioDelaySupported,
  getLastAudioDelay,
  hasAudioGraph,
  MAX_AUDIO_DELAY,
  releaseAudioDelay,
  setAudioDelay as applyAudioDelay,
} from './audioDelay';
import { useAudioPlayer } from './AudioPlayerProvider';
import { buildDeviceProfile, MAX_BITRATE } from './deviceProfile';
import {
  reportPlaybackProgress,
  reportPlaybackStart,
  reportPlaybackStopped,
  stopTranscoding,
  type PlayMethod,
} from './reporting';
import { SeekBar } from './SeekBar';
import { PlaybackInfo } from './PlaybackInfo';
import {
  MAX_PICTURE_ZOOM,
  PICTURE_ASPECTS,
  PICTURE_FITS,
  pictureStyle,
  readPictureFit,
  storePictureFit,
  type PictureAspect,
  type PictureFit,
} from './picture';
import {
  clearSleepTimer,
  getSleepTimer,
  onSleepTimerFired,
  SLEEP_TIMER_MINUTES,
  sleepAtEndOfVideo,
  startSleepTimer,
  useSleepTimer,
} from './sleepTimer';
import { SubtitleOverlay } from './SubtitleOverlay';
import { useSyncPlay, useSyncPlayManager } from './SyncPlayProvider';
import { SUBTITLE_SIZES, useSubtitleStyle } from './subtitleStyle';
import { recallTracks, rememberAudioTrack, rememberSubtitleTrack } from './trackMemory';
import type { VideoPlayerState } from './usePlay';
import { isPlayPath, useVideoSession } from './VideoSession';

const BITRATE_KEY = 'jellyplex.maxBitrate';
const VOLUME_KEY = 'jellyplex.volume';

const QUALITY_OPTIONS: { label: string; value: number }[] = [
  { label: 'Original / Auto', value: MAX_BITRATE },
  { label: '40 Mbps 4K', value: 40_000_000 },
  { label: '20 Mbps 1080p', value: 20_000_000 },
  { label: '12 Mbps 1080p', value: 12_000_000 },
  { label: '8 Mbps 1080p', value: 8_000_000 },
  { label: '4 Mbps 720p', value: 4_000_000 },
  { label: '3 Mbps 720p', value: 3_000_000 },
  { label: '2 Mbps 480p', value: 2_000_000 },
  { label: '1 Mbps 480p', value: 1_000_000 },
  { label: '720 kbps 360p', value: 720_000 },
];

interface ActiveStream {
  url: string;
  isHls: boolean;
  method: PlayMethod;
  playSessionId: string;
  source: MediaSourceInfo;
  audioIndex?: number;
  subIndex: number;
  burnedSub: boolean;
  transcodeReasons: string[];
}

interface LoadOptions {
  start: number;
  audioIndex?: number;
  /** undefined = let the server pick based on user preferences; -1 = off. */
  subIndex?: number;
  bitrate: number;
  mediaSourceId?: string;
  forceTranscode?: boolean;
  /** Buffer without starting (SyncPlay starts everyone at the same moment). */
  holdStart?: boolean;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/** Furthest the subtitles can be shifted, in seconds. The slider covers the middle of that range. */
const MAX_SUBTITLE_DELAY = 60;
const SUBTITLE_DELAY_SLIDER = 10;

/** Rounds away the floating-point noise of repeated small steps. */
function clampStep(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, value)) * 1000) / 1000;
}

/** Display width of the seek-bar thumbnail preview, in px. */
const TRICKPLAY_PREVIEW_WIDTH = 240;

const pipSupported = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled;

/** Wall-clock time at which playback will finish, taking playback speed into account. */
function EndsAt({ remaining, speed }: { remaining: number; speed: number }) {
  // Re-render on a timer too, so the time keeps moving while paused.
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const [timeFormat] = useTimeFormat();
  const end = new Date(Date.now() + (remaining / speed) * 1000);
  return (
    <span className="mr-2 hidden text-sm text-white/70 tabular-nums sm:inline">
      Ends at {formatTimeOfDay(end, timeFormat)}
    </span>
  );
}

/** Countdown shown in the controls while a sleep timer is running. */
function SleepIndicator() {
  const sleep = useSleepTimer();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!sleep.endsAt) return;
    const timer = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [sleep.endsAt]);
  if (!sleep.endsAt && !sleep.endOfVideo) return null;
  const left = sleep.endsAt ? Math.max(0, (sleep.endsAt - Date.now()) / 1000) : 0;
  return (
    <span
      data-testid="sleep-indicator"
      className="mr-2 flex items-center gap-1 text-sm text-accent tabular-nums"
      title={sleep.endOfVideo ? 'Sleep timer: stops when this video ends' : 'Sleep timer'}
    >
      <Moon size={15} />
      {sleep.endOfVideo ? 'End of video' : formatClock(left)}
    </span>
  );
}

/** Picks the thumbnail resolution closest to the preview size for the playing media source. */
function pickTrickplay(item: BaseItemDto | undefined, sourceId: string | undefined): TrickplayInfo | null {
  if (!item?.Trickplay || !sourceId) return null;
  const norm = (id: string) => id.replace(/-/g, '').toLowerCase();
  const key = Object.keys(item.Trickplay).find((k) => norm(k) === norm(sourceId));
  const infos = key ? Object.values(item.Trickplay[key]) : [];
  if (!infos.length) return null;
  return infos.reduce((best, i) =>
    Math.abs(i.Width - TRICKPLAY_PREVIEW_WIDTH) < Math.abs(best.Width - TRICKPLAY_PREVIEW_WIDTH) ? i : best,
  );
}

const SEGMENT_LABELS: Record<string, string> = {
  Intro: 'Skip Intro',
  Recap: 'Skip Recap',
  Preview: 'Skip Preview',
  Outro: 'Skip Credits',
  Commercial: 'Skip Ad',
};

function streamName(s: MediaStream): string {
  return s.DisplayTitle || [s.Language, s.Codec?.toUpperCase()].filter(Boolean).join(' ') || `Track ${s.Index}`;
}

function readNumber(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

/** App-level player: renders the current video session full screen or as the mini player. */
export default function GlobalVideoPlayer() {
  const { session } = useVideoSession();
  // A sleep timer belongs to the viewing session: drop it once the player is closed.
  useEffect(() => () => clearSleepTimer(), []);
  if (!session) return null;
  // Remount per session so each playback is fully isolated.
  return <VideoPlayer key={session.key} itemId={session.itemId} navState={session.state} />;
}

function VideoPlayer({ itemId, navState }: { itemId: string; navState: VideoPlayerState }) {
  const api = useApi();
  const { userId } = useSession();
  const navigate = useNavigate();
  const { mode, start, close, expand, minimize } = useVideoSession();
  const isFull = mode === 'full';
  const audioPlayer = useAudioPlayer();
  const { data: item, error: itemError } = useItem(itemId);
  const { data: user } = useCurrentUser();
  const segments = useMediaSegments(itemId);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const streamRef = useRef<ActiveStream | null>(null);
  const startedRef = useRef(false);
  const loadToken = useRef(0);
  const fallbackTried = useRef(false);
  const subtitleUrlRef = useRef<string | null>(null);
  const subtitleTrackRef = useRef<HTMLTrackElement | null>(null);
  const toast = useToast();
  const sleep = useSleepTimer();
  const [subtitleStyle, setSubtitleStyle] = useSubtitleStyle();
  // SyncPlay: this playback belongs to a group and follows the server's commands.
  const syncManager = useSyncPlayManager();
  const sync = useSyncPlay();
  const syncItemId = navState.syncPlaylistItemId;
  const inSync = Boolean(syncItemId) && sync.following && sync.playlistItemId === syncItemId;

  const [stream, setStream] = useState<ActiveStream | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(() => Math.min(1, readNumber(VOLUME_KEY, 1)));
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [panel, setPanel] = useState<'none' | 'settings' | 'subtitles' | 'chapters' | 'picture'>('none');
  /** A text subtitle track is attached (drawn by SubtitleOverlay). */
  const [textSubtitles, setTextSubtitles] = useState(false);
  /** Seconds the subtitles are shifted: positive = later. */
  const [subtitleDelay, setSubtitleDelay] = useState(0);
  /** Seconds the sound is held back. Carried over to the next video. */
  const [audioDelay, setAudioDelay] = useState(getLastAudioDelay);
  const [pictureFit, setPictureFit] = useState<PictureFit>(readPictureFit);
  const [pictureAspect, setPictureAspect] = useState<PictureAspect>('auto');
  const [pictureZoom, setPictureZoom] = useState(1);
  const [boxSize, setBoxSize] = useState({ width: 0, height: 0 });
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [showInfo, setShowInfo] = useState(false);
  const [maxBitrate, setMaxBitrate] = useState(() => readNumber(BITRATE_KEY, MAX_BITRATE));
  const [upNextDismissed, setUpNextDismissed] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [inPip, setInPip] = useState(false);
  /** Short on-screen note for changes made with the keyboard. */
  const [osd, setOsd] = useState<string | null>(null);
  const osdTimer = useRef<number | undefined>(undefined);
  const flash = useCallback((text: string) => {
    setOsd(text);
    window.clearTimeout(osdTimer.current);
    osdTimer.current = window.setTimeout(() => setOsd(null), 1500);
  }, []);
  useEffect(() => () => window.clearTimeout(osdTimer.current), []);

  // Episodes remember the audio and subtitle track per show (see trackMemory.ts), following the
  // user's "Remember audio/subtitle selections" preferences.
  const seriesId = item?.Type === 'Episode' ? item.SeriesId : undefined;
  const rememberAudio = user?.Configuration?.RememberAudioSelections !== false;
  const rememberSubtitles = user?.Configuration?.RememberSubtitleSelections !== false;
  // Safari on iOS plays HLS itself, and its sound can't be routed through Web Audio.
  const audioDelayAvailable = audioDelaySupported() && !(stream?.isHls && !Hls.isSupported());

  // ---- Up next -----------------------------------------------------------
  const queue = navState.queue;
  const queueIndex = queue ? queue.indexOf(itemId) : -1;
  const nextFromQueue = queue && queueIndex >= 0 && queueIndex < queue.length - 1 ? queue[queueIndex + 1] : undefined;
  const nextEpisode = useQuery({
    queryKey: ['next-episode', itemId],
    queryFn: () =>
      api.get<ItemsResult>(`/Shows/${item!.SeriesId}/Episodes`, {
        userId,
        startItemId: itemId,
        limit: 2,
        isMissing: false,
        fields: ['PrimaryImageAspectRatio'],
      }),
    enabled: !nextFromQueue && item?.Type === 'Episode' && Boolean(item.SeriesId),
    staleTime: Infinity,
  });
  const nextId = nextFromQueue ?? nextEpisode.data?.Items.find((i) => i.Id !== itemId)?.Id;
  const { data: nextItem } = useItem(nextId);
  // Honour the user's "Automatically play the next episode" preference for TV episodes.
  // A "stop at the end of this video" sleep timer also turns it off.
  const autoAdvance =
    !sleep.endOfVideo && (item?.Type !== 'Episode' || user?.Configuration?.EnableNextEpisodeAutoPlay !== false);

  /** Stop playback entirely (leaving the full-screen route if we're on it). */
  const exit = useCallback(() => {
    minimize();
    close();
  }, [minimize, close]);

  const goNext = useCallback(() => {
    if (!nextId) return;
    // In a SyncPlay group the whole group moves on; the server then tells everyone what to open.
    if (syncItemId && syncManager?.getSnapshot().playlistItemId === syncItemId) {
      syncManager.requestNext();
      return;
    }
    const state: VideoPlayerState = { queue, token: generateId() };
    start(nextId, state);
    if (isPlayPath(window.location.pathname)) navigate(`/play/${nextId}`, { replace: true, state });
  }, [nextId, queue, start, navigate, syncItemId, syncManager]);

  // ---- Session lifecycle -------------------------------------------------
  const endSession = useCallback(
    (keepalive: boolean) => {
      const s = streamRef.current;
      const video = videoRef.current;
      if (!s) return;
      streamRef.current = null;
      if (startedRef.current) {
        startedRef.current = false;
        void reportPlaybackStopped(
          api,
          {
            ItemId: itemId,
            MediaSourceId: s.source.Id,
            PlaySessionId: s.playSessionId,
            PositionTicks: secondsToTicks(video?.currentTime ?? 0),
          },
          keepalive,
        );
      }
      if (s.method === 'Transcode') void stopTranscoding(api, s.playSessionId, keepalive);
    },
    [api, itemId],
  );

  const clearSubtitles = useCallback(() => {
    const video = videoRef.current;
    if (video) video.querySelectorAll('track').forEach((t) => t.remove());
    subtitleTrackRef.current = null;
    setTextSubtitles(false);
    if (subtitleUrlRef.current) {
      URL.revokeObjectURL(subtitleUrlRef.current);
      subtitleUrlRef.current = null;
    }
  }, []);

  const attachSubtitle = useCallback(
    async (s: MediaStream, token: number) => {
      const video = videoRef.current;
      if (!video || !s.DeliveryUrl) return;
      const url = /^https?:\/\//i.test(s.DeliveryUrl) ? s.DeliveryUrl : api.serverUrl + s.DeliveryUrl;
      try {
        const res = await fetch(url, { headers: { Authorization: api.authorizationHeader() } });
        if (!res.ok) throw new Error(`Subtitle request failed (${res.status})`);
        const text = await res.text();
        if (token !== loadToken.current) return;
        clearSubtitles();
        const blobUrl = URL.createObjectURL(new Blob([text], { type: 'text/vtt' }));
        subtitleUrlRef.current = blobUrl;
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = streamName(s);
        if (s.Language) track.srclang = s.Language;
        track.src = blobUrl;
        track.default = true;
        video.appendChild(track);
        // 'hidden' loads the cues without the browser drawing them; SubtitleOverlay draws them
        // (picture-in-picture is the exception, see below).
        track.track.mode = document.pictureInPictureElement === video ? 'showing' : 'hidden';
        subtitleTrackRef.current = track;
        setTextSubtitles(true);
      } catch (err) {
        console.warn('Failed to load subtitles', err);
      }
    },
    [api, clearSubtitles],
  );

  const destroyHls = useCallback(() => {
    hlsRef.current?.destroy();
    hlsRef.current = null;
  }, []);

  const load = useCallback(
    async (opts: LoadOptions) => {
      const video = videoRef.current;
      if (!video || !item) return;
      const token = ++loadToken.current;
      setLoading(true);
      setError(null);
      endSession(false);
      const synced = Boolean(syncItemId) && syncManager?.getSnapshot().playlistItemId === syncItemId;
      if (synced) syncManager?.reloading();

      try {
        const info = await api.post<PlaybackInfoResponse>(`/Items/${item.Id}/PlaybackInfo`, {
          UserId: userId,
          StartTimeTicks: 0,
          IsPlayback: true,
          AutoOpenLiveStream: true,
          MaxStreamingBitrate: opts.bitrate,
          AudioStreamIndex: opts.audioIndex,
          SubtitleStreamIndex: opts.subIndex,
          MediaSourceId: opts.mediaSourceId,
          EnableDirectPlay: !opts.forceTranscode,
          EnableDirectStream: !opts.forceTranscode,
          EnableTranscoding: true,
          AllowVideoStreamCopy: true,
          AllowAudioStreamCopy: true,
          DeviceProfile: buildDeviceProfile(opts.bitrate),
        });
        if (token !== loadToken.current) return;
        if (info.ErrorCode) {
          throw new Error(
            info.ErrorCode === 'NotAllowed'
              ? 'You are not allowed to play this item.'
              : info.ErrorCode === 'RateLimitExceeded'
                ? 'The server’s bitrate limit was exceeded.'
                : 'No compatible stream is available for this browser.',
          );
        }
        const source = info.MediaSources.find((s) => s.Id === opts.mediaSourceId) ?? info.MediaSources[0];
        if (!source) throw new Error('No playable media source was found.');

        const playSessionId = info.PlaySessionId ?? generateId();
        const staticUrl = () =>
          api.url(
            `/Videos/${item.Id}/stream`,
            {
              static: true,
              mediaSourceId: source.Id,
              deviceId: api.deviceId,
              playSessionId,
              Tag: source.ETag ?? undefined,
              LiveStreamId: source.LiveStreamId ?? undefined,
            },
            true,
          );

        let url: string;
        let method: PlayMethod;
        let isHls = false;
        if (!opts.forceTranscode && source.SupportsDirectPlay) {
          url = staticUrl();
          method = 'DirectPlay';
        } else if (source.TranscodingUrl) {
          url = /^https?:\/\//i.test(source.TranscodingUrl) ? source.TranscodingUrl : api.serverUrl + source.TranscodingUrl;
          isHls = source.TranscodingSubProtocol === 'hls' || /\.m3u8/i.test(source.TranscodingUrl);
          method = 'Transcode';
        } else if (!opts.forceTranscode && source.SupportsDirectStream) {
          url = staticUrl();
          method = 'DirectStream';
        } else {
          throw new Error('This item can’t be played in this browser, and the server could not provide a transcode.');
        }

        const reasons = (() => {
          if (!source.TranscodingUrl) return [];
          const m = /[?&]TranscodeReasons=([^&]*)/i.exec(source.TranscodingUrl);
          return m ? decodeURIComponent(m[1]).split(',').filter(Boolean) : [];
        })();

        const audioIndex = opts.audioIndex ?? source.DefaultAudioStreamIndex ?? undefined;
        const subIndex = opts.subIndex ?? source.DefaultSubtitleStreamIndex ?? -1;
        const subStream = source.MediaStreams?.find((s) => s.Type === 'Subtitle' && s.Index === subIndex);
        const active: ActiveStream = {
          url,
          isHls,
          method,
          playSessionId,
          source,
          audioIndex,
          subIndex,
          burnedSub: Boolean(subStream && subStream.DeliveryMethod === 'Encode'),
          transcodeReasons: reasons,
        };

        // Attach the new source.
        destroyHls();
        clearSubtitles();
        video.pause();
        video.removeAttribute('src');
        video.load();
        streamRef.current = active;
        startedRef.current = false;
        setStream(active);

        const start = Math.max(0, opts.start);
        if (isHls && Hls.isSupported()) {
          const hls = new Hls({
            startPosition: start,
            maxBufferLength: 30,
            maxMaxBufferLength: 120,
            backBufferLength: 90,
            manifestLoadingTimeOut: 30_000,
            enableWorker: true,
          });
          hlsRef.current = hls;
          let mediaRecoveries = 0;
          hls.on(Events.ERROR, (_e, data) => {
            if (!data.fatal || token !== loadToken.current) return;
            if (data.type === ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
              mediaRecoveries++;
              hls.recoverMediaError();
              return;
            }
            setLoading(false);
            setError(
              data.type === ErrorTypes.NETWORK_ERROR
                ? 'Lost connection to the stream. The server may have stopped transcoding.'
                : `Playback error: ${data.details}`,
            );
          });
          hls.loadSource(url);
          hls.attachMedia(video);
        } else {
          video.src = url;
          if (start > 0) {
            video.addEventListener(
              'loadedmetadata',
              () => {
                if (token === loadToken.current) video.currentTime = start;
              },
              { once: true },
            );
          }
        }

        if (subStream && subStream.DeliveryMethod === 'External' && subStream.DeliveryUrl) {
          void attachSubtitle(subStream, token);
        }

        // SyncPlay: only buffer. The group starts together once every member is ready.
        if (opts.holdStart || synced) return;
        video.play().catch((err: Error) => {
          // Autoplay may be blocked; the user can press play.
          if (err.name === 'NotAllowedError') {
            setLoading(false);
            setPlaying(false);
          }
        });
      } catch (err) {
        if (token !== loadToken.current) return;
        setLoading(false);
        setError(errorMessage(err));
      }
    },
    [api, item, userId, endSession, destroyHls, clearSubtitles, attachSubtitle, syncItemId, syncManager],
  );

  // SyncPlay: hand the video element to the group manager for as long as this player is open.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !syncItemId || !syncManager) return;
    return syncManager.attach(video, syncItemId);
  }, [syncItemId, syncManager]);

  // Initial load once the item is known.
  const initialised = useRef(false);
  useEffect(() => {
    if (!item || initialised.current) return;
    initialised.current = true;
    audioPlayer.pause();
    const resumeAt =
      navState.startPositionTicks != null
        ? ticksToSeconds(navState.startPositionTicks)
        : navState.fromStart
          ? 0
          : ticksToSeconds(item.UserData?.PlaybackPositionTicks);
    setDuration(ticksToSeconds(item.RunTimeTicks));
    const source = item.MediaSources?.find((s) => s.Id === navState.mediaSourceId) ?? item.MediaSources?.[0];
    const remembered = recallTracks(seriesId, source?.MediaStreams, { audio: rememberAudio, subtitle: rememberSubtitles });
    void load({
      start: resumeAt,
      audioIndex: navState.audioStreamIndex ?? remembered.audioIndex,
      subIndex: navState.subtitleStreamIndex ?? remembered.subtitleIndex,
      bitrate: maxBitrate,
      mediaSourceId: navState.mediaSourceId,
      holdStart: Boolean(navState.syncPlaylistItemId),
    });
  }, [item, load, navState, maxBitrate, audioPlayer, seriesId, rememberAudio, rememberSubtitles]);

  // Teardown on unmount / tab close.
  useEffect(() => {
    const video = videoRef.current;
    const onHide = () => endSession(true);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      loadToken.current++;
      // Allow a fresh initial load if React re-mounts this component (StrictMode).
      initialised.current = false;
      endSession(true);
      destroyHls();
      clearSubtitles();
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    };
  }, [endSession, destroyHls, clearSubtitles]);

  // ---- Video element events ---------------------------------------------
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const progress = (eventName?: string) => {
      const s = streamRef.current;
      if (!s || !startedRef.current) return;
      void reportPlaybackProgress(api, {
        ItemId: itemId,
        MediaSourceId: s.source.Id,
        PlaySessionId: s.playSessionId,
        PositionTicks: secondsToTicks(video.currentTime),
        IsPaused: video.paused,
        IsMuted: video.muted,
        VolumeLevel: Math.round(video.volume * 100),
        PlayMethod: s.method,
        AudioStreamIndex: s.audioIndex,
        SubtitleStreamIndex: s.subIndex,
        EventName: eventName,
      });
    };
    const onPlaying = () => {
      setPlaying(true);
      setLoading(false);
      const s = streamRef.current;
      if (s && !startedRef.current) {
        startedRef.current = true;
        void reportPlaybackStart(api, {
          ItemId: itemId,
          MediaSourceId: s.source.Id,
          PlaySessionId: s.playSessionId,
          PositionTicks: secondsToTicks(video.currentTime),
          IsPaused: false,
          PlayMethod: s.method,
          AudioStreamIndex: s.audioIndex,
          SubtitleStreamIndex: s.subIndex,
        });
      }
    };
    const onPlay = () => {
      setPlaying(true);
      progress('unpause');
    };
    const onPause = () => {
      setPlaying(false);
      progress('pause');
    };
    const onTime = () => setCurrentTime(video.currentTime);
    const onDuration = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) setDuration(video.duration);
    };
    const onProgress = () => {
      const b = video.buffered;
      for (let i = 0; i < b.length; i++) {
        if (b.start(i) <= video.currentTime + 0.5 && b.end(i) >= video.currentTime) {
          setBuffered(b.end(i));
          return;
        }
      }
    };
    const onWaiting = () => setLoading(true);
    const onCanPlay = () => setLoading(false);
    const onSeeked = () => progress('timeupdate');
    const onError = () => {
      const s = streamRef.current;
      if (!s || hlsRef.current) return; // hls.js reports its own errors
      const mediaError = video.error;
      if (!mediaError) return;
      if (s.method !== 'Transcode' && !fallbackTried.current) {
        // Direct play failed (unsupported codec in practice) – fall back to a server transcode.
        fallbackTried.current = true;
        void load({
          start: video.currentTime,
          audioIndex: s.audioIndex,
          subIndex: s.subIndex,
          bitrate: maxBitrate,
          mediaSourceId: s.source.Id,
          forceTranscode: true,
        });
        return;
      }
      setLoading(false);
      setError(`The video could not be played (${mediaError.message || `code ${mediaError.code}`}).`);
    };

    video.addEventListener('playing', onPlaying);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('durationchange', onDuration);
    video.addEventListener('loadedmetadata', onDuration);
    video.addEventListener('progress', onProgress);
    video.addEventListener('timeupdate', onProgress);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    const timer = window.setInterval(() => {
      if (!video.paused) progress('timeupdate');
    }, 10_000);
    return () => {
      window.clearInterval(timer);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('durationchange', onDuration);
      video.removeEventListener('loadedmetadata', onDuration);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('timeupdate', onProgress);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
  }, [api, itemId, load, maxBitrate]);

  // Auto-advance at the end.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnded = () => {
      const stopHere = getSleepTimer().endOfVideo;
      if (stopHere) clearSleepTimer();
      if (syncItemId && syncManager?.getSnapshot().playlistItemId === syncItemId) {
        // The group's queue decides what comes next (requestNext is a no-op for all but the first to ask).
        if (stopHere || !syncManager.requestNext()) exit();
        return;
      }
      if (nextId && autoAdvance && !upNextDismissed && !stopHere) goNext();
      else exit();
    };
    video.addEventListener('ended', onEnded);
    return () => video.removeEventListener('ended', onEnded);
  }, [nextId, autoAdvance, upNextDismissed, goNext, exit, syncItemId, syncManager]);

  // Volume
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
    try {
      localStorage.setItem(VOLUME_KEY, String(volume));
    } catch {
      /* ignore */
    }
  }, [volume, muted]);

  // Audio delay. Sound from another origin is silent in Web Audio unless the media was requested
  // with CORS, so such a stream is loaded again with CORS the first time a delay is set.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !audioDelayAvailable) return;
    const crossOrigin = new URL(api.serverUrl, window.location.href).origin !== window.location.origin;
    if (audioDelay !== 0 && crossOrigin && !video.crossOrigin && !hasAudioGraph(video)) {
      video.crossOrigin = 'anonymous';
      const s = streamRef.current;
      if (s && !hlsRef.current) {
        void load({
          start: video.currentTime,
          audioIndex: s.audioIndex,
          subIndex: s.subIndex,
          bitrate: maxBitrate,
          mediaSourceId: s.source.Id,
          forceTranscode: s.method === 'Transcode',
        });
      }
    }
    if (!applyAudioDelay(video, audioDelay) && audioDelay !== 0) {
      toast.error('Audio delay isn’t available in this browser.');
      setAudioDelay(0);
    }
  }, [audioDelay, audioDelayAvailable, api, load, maxBitrate, toast]);
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (video) releaseAudioDelay(video);
    };
  }, []);

  // Player and video size, for the aspect ratio and zoom modes.
  useEffect(() => {
    const el = containerRef.current;
    const video = videoRef.current;
    if (!el || !video) return;
    const observer = new ResizeObserver(() => setBoxSize({ width: el.clientWidth, height: el.clientHeight }));
    observer.observe(el);
    const onSize = () => setVideoSize({ width: video.videoWidth, height: video.videoHeight });
    video.addEventListener('loadedmetadata', onSize);
    video.addEventListener('resize', onSize);
    return () => {
      observer.disconnect();
      video.removeEventListener('loadedmetadata', onSize);
      video.removeEventListener('resize', onSize);
    };
  }, []);

  // Playback speed. defaultPlaybackRate survives source changes (quality/audio switches).
  // A SyncPlay group always plays at normal speed.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const rate = inSync ? 1 : speed;
    video.defaultPlaybackRate = rate;
    video.playbackRate = rate;
  }, [speed, inSync]);

  // Picture-in-picture state (the browser can also open/close it on its own).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnter = () => setInPip(true);
    const onLeave = () => setInPip(false);
    video.addEventListener('enterpictureinpicture', onEnter);
    video.addEventListener('leavepictureinpicture', onLeave);
    return () => {
      video.removeEventListener('enterpictureinpicture', onEnter);
      video.removeEventListener('leavepictureinpicture', onLeave);
      if (document.pictureInPictureElement === video) void document.exitPictureInPicture().catch(() => {});
    };
  }, []);

  // Our subtitle overlay isn't part of the picture-in-picture window, so let the browser draw the
  // subtitles there instead.
  useEffect(() => {
    const track = subtitleTrackRef.current?.track;
    if (track) track.mode = inPip ? 'showing' : 'hidden';
  }, [inPip, textSubtitles]);

  // Sleep timer ran out: pause.
  useEffect(
    () =>
      onSleepTimerFired(() => {
        videoRef.current?.pause();
        toast.info('Sleep timer: playback paused');
      }),
    [toast],
  );

  const togglePip = useCallback(() => {
    const video = videoRef.current;
    if (!video || !pipSupported) return;
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => {});
    else void video.requestPictureInPicture().catch(() => {});
  }, []);

  // ---- Controls ------------------------------------------------------------
  const pauseAudio = audioPlayer.pause;
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      pauseAudio();
      void video.play().catch(() => {});
    } else video.pause();
  }, [pauseAudio]);

  const seekTo = useCallback((t: number) => {
    const video = videoRef.current;
    if (!video) return;
    const max = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Infinity;
    video.currentTime = Math.min(Math.max(0, t), max - 0.25);
    setCurrentTime(video.currentTime);
  }, []);

  const skip = useCallback((delta: number) => seekTo((videoRef.current?.currentTime ?? 0) + delta), [seekTo]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (el?.requestFullscreen) {
      void el.requestFullscreen().catch(() => {});
    } else if (video?.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Auto-hide controls.
  const hideTimer = useRef<number | undefined>(undefined);
  const poke = useCallback(() => {
    setControlsVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControlsVisible(false), 3000);
  }, []);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);
  const showControls = controlsVisible || !playing || panel !== 'none' || Boolean(error);

  // Keyboard shortcuts (full-screen player only; the mini player must not hijack page keys).
  useEffect(() => {
    if (!isFull) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      let handled = true;
      switch (e.key.length === 1 && e.key !== '<' && e.key !== '>' ? e.key.toLowerCase() : e.key) {
        case ' ':
        case 'k':
          togglePlay();
          break;
        case 'ArrowLeft':
        case 'j':
          skip(-10);
          break;
        case 'ArrowRight':
        case 'l':
          skip(30);
          break;
        case 'ArrowUp':
          setVolume((v) => Math.min(1, v + 0.05));
          setMuted(false);
          break;
        case 'ArrowDown':
          setVolume((v) => Math.max(0, v - 0.05));
          break;
        case 'm':
          setMuted((m) => !m);
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'n':
          if (nextId) goNext();
          break;
        case 'p':
          togglePip();
          break;
        case 'i':
          setShowInfo((v) => !v);
          break;
        case 'g':
        case 'h':
          if (textSubtitles) {
            const next = clampStep(subtitleDelay + (e.key.toLowerCase() === 'h' ? 0.1 : -0.1), -MAX_SUBTITLE_DELAY, MAX_SUBTITLE_DELAY);
            setSubtitleDelay(next);
            flash(`Subtitle delay ${formatSubtitleDelay(next)}`);
          } else handled = false;
          break;
        case 'z':
        case 'x':
          if (audioDelayAvailable) {
            const next = clampStep(audioDelay + (e.key.toLowerCase() === 'x' ? AUDIO_DELAY_STEP : -AUDIO_DELAY_STEP), 0, MAX_AUDIO_DELAY);
            setAudioDelay(next);
            flash(`Audio delay ${formatAudioDelay(next)}`);
          } else handled = false;
          break;
        case '>':
        case '<': {
          if (inSync) break;
          const i = SPEED_OPTIONS.indexOf(speed);
          const next = SPEED_OPTIONS[Math.min(SPEED_OPTIONS.length - 1, Math.max(0, i + (e.key === '>' ? 1 : -1)))];
          setSpeed(next);
          break;
        }
        case 'Escape':
          if (panel !== 'none') setPanel('none');
          else if (!document.fullscreenElement) minimize();
          else handled = false;
          break;
        default:
          handled = false;
      }
      if (handled) {
        e.preventDefault();
        poke();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFull, togglePlay, skip, toggleFullscreen, togglePip, minimize, goNext, nextId, panel, poke, speed, textSubtitles, inSync, subtitleDelay, audioDelay, audioDelayAvailable, flash]);

  // Collapsing into the mini player: close menus and leave browser full screen.
  useEffect(() => {
    if (isFull) return;
    setPanel('none');
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, [isFull]);

  // Starting music pauses the video (only one thing plays at a time).
  useEffect(() => {
    if (audioPlayer.isPlaying) videoRef.current?.pause();
  }, [audioPlayer.isPlaying]);

  // OS media controls (media keys, lock screen). Claimed whenever the video starts playing, since
  // the music player uses the same session.
  const mediaMetaRef = useRef<MediaMetadata | null>(null);
  useEffect(() => {
    if (!('mediaSession' in navigator) || !item || !playing) return;
    const ms = navigator.mediaSession;
    const art = imageSrc(api, cardImage(item, 'landscape'), 512);
    const meta = new MediaMetadata({
      title: item.Type === 'Episode' ? `${episodeLabel(item)}${item.Name ? ` · ${item.Name}` : ''}` : (item.Name ?? ''),
      artist: item.Type === 'Episode' ? (item.SeriesName ?? '') : item.ProductionYear ? String(item.ProductionYear) : '',
      artwork: art ? [{ src: art, sizes: '512x288' }] : [],
    });
    mediaMetaRef.current = meta;
    ms.metadata = meta;
    const handlers: [MediaSessionAction, MediaSessionActionHandler | null][] = [
      ['play', () => togglePlay()],
      ['pause', () => videoRef.current?.pause()],
      ['seekbackward', (d) => skip(-(d.seekOffset ?? 10))],
      ['seekforward', (d) => skip(d.seekOffset ?? 30)],
      ['seekto', (d) => d.seekTime !== undefined && seekTo(d.seekTime)],
      ['previoustrack', null],
      ['nexttrack', nextId ? () => goNext() : null],
    ];
    for (const [action, handler] of handlers) {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        /* action not supported by this browser */
      }
    }
  }, [api, item, playing, nextId, togglePlay, skip, seekTo, goNext]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const video = videoRef.current;
    if (!video) return;
    const update = () => {
      if (navigator.mediaSession.metadata !== mediaMetaRef.current) return;
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      try {
        navigator.mediaSession.setPositionState({
          duration: video.duration,
          position: Math.min(video.currentTime, video.duration),
          playbackRate: video.playbackRate || 1,
        });
      } catch {
        /* ignore */
      }
    };
    const events = ['playing', 'pause', 'seeked', 'ratechange', 'durationchange'];
    events.forEach((ev) => video.addEventListener(ev, update));
    return () => events.forEach((ev) => video.removeEventListener(ev, update));
  }, []);

  // Release the media session when this player goes away, unless music has taken it over.
  useEffect(
    () => () => {
      if (!('mediaSession' in navigator) || navigator.mediaSession.metadata !== mediaMetaRef.current) return;
      const ms = navigator.mediaSession;
      ms.metadata = null;
      for (const action of ['play', 'pause', 'seekbackward', 'seekforward', 'seekto', 'nexttrack'] as MediaSessionAction[]) {
        try {
          ms.setActionHandler(action, null);
        } catch {
          /* ignore */
        }
      }
    },
    [],
  );

  // Single click toggles playback, double click toggles fullscreen.
  const clickTimer = useRef<number | undefined>(undefined);
  const onSurfaceClick = () => {
    if (!isFull) {
      expand();
      return;
    }
    if (panel !== 'none') {
      setPanel('none');
      return;
    }
    window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(togglePlay, 220);
  };
  const onSurfaceDoubleClick = () => {
    window.clearTimeout(clickTimer.current);
    if (!isFull) return;
    toggleFullscreen();
  };

  // ---- Track switching -----------------------------------------------------
  const sourceStreams = stream?.source.MediaStreams ?? [];
  const audioStreams = sourceStreams.filter((s) => s.Type === 'Audio');
  const subtitleStreams = sourceStreams.filter((s) => s.Type === 'Subtitle');

  const changeAudio = (index: number) => {
    setPanel('none');
    if (!stream || index === stream.audioIndex) return;
    if (seriesId && rememberAudio) rememberAudioTrack(seriesId, audioStreams.find((s) => s.Index === index));
    void load({
      start: videoRef.current?.currentTime ?? 0,
      audioIndex: index,
      subIndex: stream.subIndex,
      bitrate: maxBitrate,
      mediaSourceId: stream.source.Id,
    });
  };

  const changeSubtitle = (index: number) => {
    setPanel('none');
    if (!stream || index === stream.subIndex) return;
    const target = subtitleStreams.find((s) => s.Index === index);
    if (seriesId && rememberSubtitles && (target || index === -1)) rememberSubtitleTrack(seriesId, target);
    const canSwapLocally = !stream.burnedSub && (index === -1 || target?.DeliveryMethod === 'External');
    if (canSwapLocally) {
      const token = loadToken.current;
      clearSubtitles();
      if (target) void attachSubtitle(target, token);
      const updated = { ...stream, subIndex: index };
      streamRef.current = updated;
      setStream(updated);
      return;
    }
    void load({
      start: videoRef.current?.currentTime ?? 0,
      audioIndex: stream.audioIndex,
      subIndex: index,
      bitrate: maxBitrate,
      mediaSourceId: stream.source.Id,
    });
  };

  const changeQuality = (bitrate: number) => {
    setPanel('none');
    setMaxBitrate(bitrate);
    try {
      localStorage.setItem(BITRATE_KEY, String(bitrate));
    } catch {
      /* ignore */
    }
    if (!stream) return;
    void load({
      start: videoRef.current?.currentTime ?? 0,
      audioIndex: stream.audioIndex,
      subIndex: stream.subIndex,
      bitrate,
      mediaSourceId: stream.source.Id,
    });
  };

  const retry = () => {
    fallbackTried.current = false;
    void load({
      start: videoRef.current?.currentTime || currentTime,
      audioIndex: stream?.audioIndex,
      subIndex: stream?.subIndex,
      bitrate: maxBitrate,
      mediaSourceId: stream?.source.Id,
    });
  };

  const retryTranscode = () => {
    fallbackTried.current = true;
    void load({
      start: videoRef.current?.currentTime || currentTime,
      audioIndex: stream?.audioIndex,
      subIndex: stream?.subIndex,
      bitrate: maxBitrate,
      mediaSourceId: stream?.source.Id,
      forceTranscode: true,
    });
  };

  // Let remote control (other devices) drive this player. The handle is registered once and
  // always calls the latest closures.
  const controls = useRef<Omit<ActiveVideo, 'itemId' | 'video'> | null>(null);
  controls.current = {
    play: () => {
      pauseAudio();
      void videoRef.current?.play().catch(() => {});
    },
    pause: () => videoRef.current?.pause(),
    seek: seekTo,
    stop: exit,
    next: goNext,
    setVolume: (v) => {
      setVolume(v);
      setMuted(false);
    },
    setMuted: (m) => setMuted(m === 'toggle' ? (prev) => !prev : m),
    setAudioIndex: changeAudio,
    setSubtitleIndex: changeSubtitle,
    toggleFullscreen,
  };
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    return registerActiveVideo({
      itemId,
      video,
      play: () => controls.current?.play(),
      pause: () => controls.current?.pause(),
      seek: (s) => controls.current?.seek(s),
      stop: () => controls.current?.stop(),
      next: () => controls.current?.next(),
      setVolume: (v) => controls.current?.setVolume(v),
      setMuted: (m) => controls.current?.setMuted(m),
      setAudioIndex: (i) => controls.current?.setAudioIndex(i),
      setSubtitleIndex: (i) => controls.current?.setSubtitleIndex(i),
      toggleFullscreen: () => controls.current?.toggleFullscreen(),
    });
  }, [itemId]);

  // ---- Derived UI state ------------------------------------------------------
  const activeSegment = useMemo(() => {
    const list = segments.data?.Items ?? [];
    return list.find((s) => {
      const start = ticksToSeconds(s.StartTicks);
      const end = ticksToSeconds(s.EndTicks);
      return SEGMENT_LABELS[s.Type] && currentTime >= start && currentTime < end - 1;
    });
  }, [segments.data, currentTime]);

  const remaining = duration - currentTime;
  const inOutro = activeSegment?.Type === 'Outro';
  const showUpNext = Boolean(nextItem) && !upNextDismissed && duration > 60 && (remaining <= 25 || inOutro) && !error;
  const chapterMarks = useMemo(
    () => (item?.Chapters ?? []).map((c) => ticksToSeconds(c.StartPositionTicks)).filter((t) => t > 0),
    [item?.Chapters],
  );

  const chapters = useMemo(
    () => (item?.Chapters ?? []).map((c, index) => ({ index, start: ticksToSeconds(c.StartPositionTicks), name: c.Name || `Chapter ${index + 1}`, tag: c.ImageTag })),
    [item?.Chapters],
  );
  const currentChapter = chapters.reduce((found, c) => (c.start <= currentTime + 0.25 ? c.index : found), -1);

  const trickplay = useMemo(() => pickTrickplay(item, stream?.source.Id), [item, stream?.source.Id]);
  const renderTrickplay = useCallback(
    (seconds: number) => {
      if (!trickplay || !stream) return null;
      const perTile = trickplay.TileWidth * trickplay.TileHeight;
      const n = Math.min(trickplay.ThumbnailCount - 1, Math.max(0, Math.floor((seconds * 1000) / trickplay.Interval)));
      const sheet = Math.floor(n / perTile);
      const cell = n % perTile;
      const scale = TRICKPLAY_PREVIEW_WIDTH / trickplay.Width;
      const w = trickplay.Width * scale;
      const h = trickplay.Height * scale;
      const url = api.url(
        `/Videos/${itemId}/Trickplay/${trickplay.Width}/${sheet}.jpg`,
        { mediaSourceId: stream.source.Id },
        true,
      );
      return (
        <div
          className="mb-1 rounded-sm bg-black bg-no-repeat"
          style={{
            width: w,
            height: h,
            backgroundImage: `url("${url}")`,
            backgroundSize: `${trickplay.TileWidth * w}px auto`,
            backgroundPosition: `-${(cell % trickplay.TileWidth) * w}px -${Math.floor(cell / trickplay.TileWidth) * h}px`,
          }}
        />
      );
    },
    [api, itemId, trickplay, stream],
  );

  const changePictureFit = (fit: PictureFit) => {
    setPictureFit(fit);
    storePictureFit(fit);
  };
  // The mini player always shows the whole picture.
  const picture = isFull
    ? pictureStyle({ fit: pictureFit, aspect: pictureAspect, zoom: pictureZoom, box: boxSize, video: videoSize })
    : undefined;
  const pictureChanged = pictureFit !== 'fit' || pictureAspect !== 'auto' || pictureZoom !== 1;

  const miniBottom = audioPlayer.current ? 'bottom-[92px]' : 'bottom-4';
  const frameClass = isFull
    ? 'fixed inset-0 z-50 overflow-hidden bg-black'
    : clsx(
        'group/mini fixed right-4 z-[60] aspect-video w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-lg bg-black shadow-2xl ring-1 ring-white/15',
        miniBottom,
      );

  if (itemError) {
    return (
      <div className={clsx(frameClass, 'flex flex-col items-center justify-center gap-3 p-4 text-center')}>
        <p className="text-sm text-muted">{errorMessage(itemError)}</p>
        <button onClick={exit} className="rounded-md bg-white/10 px-4 py-2 text-sm hover:bg-white/20">
          {isFull ? 'Go back' : 'Close'}
        </button>
      </div>
    );
  }

  const title = item?.Type === 'Episode' ? item.SeriesName : item?.Name;
  const subtitle =
    item?.Type === 'Episode'
      ? `${episodeLabel(item)}${item.Name ? ` · ${item.Name}` : ''}`
      : item?.ProductionYear
        ? String(item.ProductionYear)
        : '';
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      ref={containerRef}
      className={clsx(frameClass, 'select-none', isFull && !showControls && 'cursor-none')}
      onMouseMove={isFull ? poke : undefined}
      onTouchStart={isFull ? poke : undefined}
    >
      {/* A resized picture may not cover the player: keep clicks next to it working. */}
      {picture && <div className="absolute inset-0" onClick={onSurfaceClick} onDoubleClick={onSurfaceDoubleClick} />}
      <video
        ref={videoRef}
        data-testid="video"
        className={clsx(
          'absolute bg-black',
          picture ? 'max-w-none' : 'inset-0 h-full w-full object-contain',
          !isFull && 'cursor-pointer',
        )}
        style={picture}
        playsInline
        preload="auto"
        onClick={onSurfaceClick}
        onDoubleClick={onSurfaceDoubleClick}
      />

      {textSubtitles && !inPip && (
        <SubtitleOverlay
          trackRef={subtitleTrackRef}
          videoRef={videoRef}
          delay={subtitleDelay}
          raised={isFull && showControls}
          compact={!isFull}
        />
      )}

      {(loading || !item) && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-accent">
          <Spinner size={isFull ? 56 : 32} />
        </div>
      )}

      {error && (
        <div
          className={clsx(
            'absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 text-center',
            isFull ? 'gap-4 px-6' : 'gap-2 px-3 text-sm',
          )}
        >
          <p className={clsx('max-w-lg text-fg', !isFull && 'line-clamp-3')}>{error}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button onClick={retry} className="rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink hover:bg-accent-hover">
              Retry
            </button>
            {isFull && stream?.method !== 'Transcode' && (
              <button onClick={retryTranscode} className="rounded-md bg-white/10 px-4 py-2 hover:bg-white/20">
                Try transcoding
              </button>
            )}
            <button onClick={exit} className="rounded-md bg-white/10 px-4 py-2 hover:bg-white/20">
              {isFull ? 'Go back' : 'Close'}
            </button>
          </div>
        </div>
      )}

      {isFull && (
        <>
      {/* Skip intro / credits */}
      {activeSegment && !showUpNext && !error && (
        <button
          onClick={() => seekTo(ticksToSeconds(activeSegment.EndTicks))}
          className={clsx(
            'absolute right-8 z-10 rounded-md bg-white/90 px-5 py-2.5 font-semibold text-black shadow-xl transition-all hover:bg-white',
            showControls ? 'bottom-32' : 'bottom-10',
          )}
        >
          {SEGMENT_LABELS[activeSegment.Type]}
        </button>
      )}

      {/* Up next */}
      {showUpNext && nextItem && (
        <UpNextCard
          item={nextItem}
          seconds={autoAdvance ? Math.max(0, Math.ceil(remaining)) : null}
          raised={showControls}
          onPlay={goNext}
          onCancel={() => setUpNextDismissed(true)}
        />
      )}

      {osd && (
        <div
          data-testid="player-osd"
          className="pointer-events-none absolute top-20 left-1/2 z-10 -translate-x-1/2 rounded-md bg-black/70 px-4 py-2 text-sm font-semibold tabular-nums"
        >
          {osd}
        </div>
      )}

      {showInfo && stream && (
        <PlaybackInfo
          videoRef={videoRef}
          source={stream.source}
          method={stream.method}
          isHls={stream.isHls}
          audioIndex={stream.audioIndex}
          subIndex={stream.subIndex}
          transcodeReasons={stream.transcodeReasons}
          onClose={() => setShowInfo(false)}
        />
      )}

      {/* Top bar */}
      <div
        className={clsx(
          'absolute inset-x-0 top-0 z-10 flex items-center gap-4 bg-gradient-to-b from-black/80 to-transparent px-4 pt-4 pb-12 transition-opacity duration-300 sm:px-6',
          showControls ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <button
          onClick={minimize}
          className="rounded-full p-2 text-white hover:bg-white/15"
          aria-label="Back"
          title="Back (keeps playing in the mini player)"
        >
          <ArrowLeft size={26} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold">{title}</div>
          {subtitle && <div className="truncate text-sm text-white/70">{subtitle}</div>}
        </div>
        {inSync && sync.group && (
          <span
            data-testid="syncplay-badge"
            className="hidden items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm text-accent sm:flex"
            title={`SyncPlay: watching with ${sync.group.Participants.join(', ')}`}
          >
            <Users size={15} /> {sync.group.GroupName} · {sync.group.Participants.length}
          </span>
        )}
        <button
          onClick={minimize}
          className="rounded-full p-2 text-white hover:bg-white/15"
          aria-label="Minimize player"
          title="Minimize player"
        >
          <ChevronDown size={26} />
        </button>
        <button onClick={exit} className="rounded-full p-2 text-white hover:bg-white/15" aria-label="Stop playback" title="Stop playback">
          <X size={26} />
        </button>
      </div>

      {/* Bottom controls */}
      <div
        className={clsx(
          'absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pt-16 pb-4 transition-opacity duration-300 sm:px-6',
          showControls ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <div className="flex items-center gap-3 text-sm text-white/80 tabular-nums">
          <span className="w-16">{formatClock(currentTime)}</span>
          <SeekBar
            className="flex-1"
            current={currentTime}
            duration={duration}
            buffered={buffered}
            onSeek={seekTo}
            markers={chapterMarks}
            renderPreview={trickplay ? renderTrickplay : undefined}
            previewWidth={trickplay ? TRICKPLAY_PREVIEW_WIDTH : undefined}
          />
          <span className="w-16 text-right">-{formatClock(Math.max(0, remaining))}</span>
        </div>
        <div className="mt-2 flex items-center gap-1 sm:gap-2">
          <ControlButton label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
            {playing ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
          </ControlButton>
          <ControlButton label="Back 10 seconds" onClick={() => skip(-10)}>
            <span className="relative">
              <RotateCcw size={24} />
              <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold">10</span>
            </span>
          </ControlButton>
          <ControlButton label="Forward 30 seconds" onClick={() => skip(30)}>
            <span className="relative">
              <RotateCw size={24} />
              <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold">30</span>
            </span>
          </ControlButton>
          {nextId && (
            <ControlButton label="Next" onClick={goNext}>
              <SkipForward size={24} fill="currentColor" />
            </ControlButton>
          )}
          <div className="group/vol ml-1 flex items-center">
            <ControlButton label={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted((m) => !m)}>
              <VolumeIcon size={24} />
            </ControlButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={muted ? 0 : volume}
              onChange={(e) => {
                setVolume(Number(e.target.value));
                setMuted(false);
              }}
              className="w-0 opacity-0 transition-all group-hover/vol:w-24 group-hover/vol:opacity-100 focus:w-24 focus:opacity-100"
              aria-label="Volume"
            />
          </div>

          <div className="flex-1" />

          <SleepIndicator />
          {duration > 0 && remaining > 0 && <EndsAt remaining={remaining} speed={inSync ? 1 : speed} />}
          {speed !== 1 && !inSync && <span className="mr-1 text-sm font-semibold text-accent tabular-nums">{speed}×</span>}
          {stream && (
            <span className="mr-2 hidden rounded border border-white/20 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-white/60 uppercase sm:inline">
              {stream.method === 'DirectPlay' ? 'Direct Play' : stream.method === 'DirectStream' ? 'Direct Stream' : 'Transcode'}
            </span>
          )}
          {chapters.length > 1 && (
            <div className="relative">
              <ControlButton
                label="Chapters"
                onClick={() => setPanel((p) => (p === 'chapters' ? 'none' : 'chapters'))}
                active={panel === 'chapters'}
              >
                <ListVideo size={24} />
              </ControlButton>
              {panel === 'chapters' && (
                <Panel wide>
                  <PanelSection title="Chapters">
                    {chapters.map((c) => (
                      <button
                        key={c.index}
                        onClick={() => {
                          seekTo(c.start);
                          setPanel('none');
                        }}
                        aria-current={c.index === currentChapter}
                        className={clsx(
                          'flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-white/10',
                          c.index === currentChapter ? 'text-accent' : 'text-white/90',
                        )}
                      >
                        {c.tag && (
                          <Img
                            src={api.imageUrl(itemId, 'Chapter', { index: c.index, tag: c.tag, maxWidth: 240 })}
                            className="aspect-video w-24 shrink-0 rounded-sm bg-black object-cover"
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate">{c.name}</span>
                        <span className="shrink-0 text-xs text-white/50 tabular-nums">{formatClock(c.start)}</span>
                      </button>
                    ))}
                  </PanelSection>
                </Panel>
              )}
            </div>
          )}
          <div className="relative">
            <ControlButton
              label="Subtitles"
              onClick={() => setPanel((p) => (p === 'subtitles' ? 'none' : 'subtitles'))}
              active={panel === 'subtitles' || (stream?.subIndex ?? -1) >= 0}
            >
              <Subtitles size={24} />
            </ControlButton>
            {panel === 'subtitles' && (
              <Panel>
                <PanelSection title="Subtitles">
                  <PanelOption selected={(stream?.subIndex ?? -1) === -1} onClick={() => changeSubtitle(-1)}>
                    None
                  </PanelOption>
                  {subtitleStreams.map((s) => (
                    <PanelOption key={s.Index} selected={stream?.subIndex === s.Index} onClick={() => changeSubtitle(s.Index)}>
                      {streamName(s)}
                      {s.DeliveryMethod === 'Encode' && <span className="ml-2 text-xs text-white/40">burn-in</span>}
                    </PanelOption>
                  ))}
                </PanelSection>
                {(stream?.subIndex ?? -1) >= 0 && (
                  <>
                    <PanelSection title="Subtitle delay">
                      {textSubtitles ? (
                        <DelayControl
                          value={subtitleDelay}
                          onChange={setSubtitleDelay}
                          min={-MAX_SUBTITLE_DELAY}
                          max={MAX_SUBTITLE_DELAY}
                          sliderMin={-SUBTITLE_DELAY_SLIDER}
                          sliderMax={SUBTITLE_DELAY_SLIDER}
                          step={0.1}
                          format={formatSubtitleDelay}
                          lessLabel="Show subtitles earlier"
                          moreLabel="Show subtitles later"
                          sliderLabel="Subtitle delay"
                          testId="subtitle-delay"
                        />
                      ) : (
                        <div className="px-4 pt-1 pb-2 text-xs text-white/50">Not available for subtitles that are burned into the video.</div>
                      )}
                    </PanelSection>
                    {textSubtitles && (
                      <PanelSection title="Text size">
                        <div className="flex flex-wrap gap-1 px-4 pt-1 pb-2">
                          {SUBTITLE_SIZES.map((sz) => (
                            <PanelChip key={sz.value} selected={subtitleStyle.size === sz.value} onClick={() => setSubtitleStyle({ size: sz.value })} title={sz.label}>
                              {sz.short}
                            </PanelChip>
                          ))}
                        </div>
                        <div className="px-4 pb-2 text-xs text-white/40">More subtitle options are under Account settings.</div>
                      </PanelSection>
                    )}
                  </>
                )}
              </Panel>
            )}
          </div>
          <div className="relative">
            <ControlButton
              label="Picture"
              onClick={() => setPanel((p) => (p === 'picture' ? 'none' : 'picture'))}
              active={panel === 'picture' || pictureChanged}
            >
              <Scaling size={24} />
            </ControlButton>
            {panel === 'picture' && (
              <Panel>
                <PanelSection title="Zoom mode">
                  <div className="flex flex-wrap gap-1 px-4 pt-1 pb-2">
                    {PICTURE_FITS.map((f) => (
                      <PanelChip key={f.value} selected={pictureFit === f.value} onClick={() => changePictureFit(f.value)} title={f.title}>
                        {f.label}
                      </PanelChip>
                    ))}
                  </div>
                </PanelSection>
                <PanelSection title="Aspect ratio">
                  <div className="flex flex-wrap gap-1 px-4 pt-1 pb-2">
                    {PICTURE_ASPECTS.map((a) => (
                      <PanelChip
                        key={a.value}
                        selected={pictureFit !== 'stretch' && pictureAspect === a.value}
                        onClick={() => {
                          setPictureAspect(a.value);
                          // Stretch ignores the aspect ratio, so picking one leaves that mode.
                          if (pictureFit === 'stretch') changePictureFit('fit');
                        }}
                      >
                        {a.label}
                      </PanelChip>
                    ))}
                  </div>
                </PanelSection>
                <PanelSection title="Zoom">
                  <div className="flex items-center gap-3 px-4 pt-1 pb-2">
                    <input
                      type="range"
                      min={1}
                      max={MAX_PICTURE_ZOOM}
                      step={0.05}
                      value={pictureZoom}
                      onChange={(e) => setPictureZoom(Number(e.target.value))}
                      aria-label="Zoom"
                      className="min-w-0 flex-1"
                    />
                    <span className="w-12 text-right text-sm tabular-nums" data-testid="picture-zoom">
                      {Math.round(pictureZoom * 100)}%
                    </span>
                  </div>
                </PanelSection>
                {pictureChanged && (
                  <div className="border-t border-white/10 py-1">
                    <PanelOption
                      selected={false}
                      onClick={() => {
                        changePictureFit('fit');
                        setPictureAspect('auto');
                        setPictureZoom(1);
                      }}
                    >
                      Reset picture
                    </PanelOption>
                  </div>
                )}
              </Panel>
            )}
          </div>
          <div className="relative">
            <ControlButton
              label="Settings"
              onClick={() => setPanel((p) => (p === 'settings' ? 'none' : 'settings'))}
              active={panel === 'settings'}
            >
              <Settings2 size={24} />
            </ControlButton>
            {panel === 'settings' && (
              <Panel>
                {audioStreams.length > 0 && (
                  <PanelSection title="Audio">
                    {audioStreams.map((s) => (
                      <PanelOption key={s.Index} selected={stream?.audioIndex === s.Index} onClick={() => changeAudio(s.Index)}>
                        {streamName(s)}
                      </PanelOption>
                    ))}
                  </PanelSection>
                )}
                {audioStreams.length > 0 && (
                  <PanelSection title="Audio delay">
                    {audioDelayAvailable ? (
                      <>
                        <DelayControl
                          value={audioDelay}
                          onChange={setAudioDelay}
                          min={0}
                          max={MAX_AUDIO_DELAY}
                          sliderMin={0}
                          sliderMax={MAX_AUDIO_DELAY}
                          step={AUDIO_DELAY_STEP}
                          format={formatAudioDelay}
                          lessLabel="Less audio delay"
                          moreLabel="More audio delay"
                          sliderLabel="Audio delay"
                          testId="audio-delay"
                        />
                        <div className="px-4 pb-2 text-xs text-white/40">
                          Holds the sound back when it is ahead of the picture. A browser can’t play sound earlier than the picture.
                        </div>
                      </>
                    ) : (
                      <div className="px-4 pt-1 pb-2 text-xs text-white/50">Not available in this browser.</div>
                    )}
                  </PanelSection>
                )}
                {!inSync && (
                  <PanelSection title="Speed">
                    <div className="flex flex-wrap gap-1 px-4 pt-1 pb-2">
                      {SPEED_OPTIONS.map((r) => (
                        <PanelChip key={r} selected={speed === r} onClick={() => setSpeed(r)}>
                          {r === 1 ? 'Normal' : `${r}×`}
                        </PanelChip>
                      ))}
                    </div>
                  </PanelSection>
                )}
                <PanelSection title="Sleep timer">
                  <div className="flex flex-wrap gap-1 px-4 pt-1 pb-2">
                    <PanelChip selected={!sleep.endsAt && !sleep.endOfVideo} onClick={clearSleepTimer}>
                      Off
                    </PanelChip>
                    {SLEEP_TIMER_MINUTES.map((m) => (
                      <PanelChip key={m} selected={false} onClick={() => startSleepTimer(m)}>
                        {m} min
                      </PanelChip>
                    ))}
                    <PanelChip selected={sleep.endOfVideo} onClick={sleepAtEndOfVideo}>
                      End of video
                    </PanelChip>
                  </div>
                </PanelSection>
                <PanelSection title="Quality">
                  {QUALITY_OPTIONS.map((q) => (
                    <PanelOption key={q.value} selected={maxBitrate === q.value} onClick={() => changeQuality(q.value)}>
                      {q.label}
                    </PanelOption>
                  ))}
                </PanelSection>
                <div className="border-t border-white/10 py-1">
                  <PanelOption
                    selected={showInfo}
                    onClick={() => {
                      setShowInfo((v) => !v);
                      setPanel('none');
                    }}
                  >
                    Playback info
                  </PanelOption>
                </div>
                {stream && (
                  <div className="border-t border-white/10 px-4 py-3 text-xs leading-relaxed text-white/50">
                    <div>
                      {stream.method === 'Transcode' ? 'Transcoding' : stream.method === 'DirectPlay' ? 'Direct playing' : 'Direct streaming'}{' '}
                      {stream.source.Container?.toUpperCase()}
                    </div>
                    {stream.transcodeReasons.length > 0 && <div>Reason: {stream.transcodeReasons.join(', ')}</div>}
                  </div>
                )}
              </Panel>
            )}
          </div>
          {pipSupported && (
            <ControlButton label={inPip ? 'Exit picture-in-picture' : 'Picture-in-picture'} onClick={togglePip} active={inPip}>
              <PictureInPicture2 size={24} />
            </ControlButton>
          )}
          <ControlButton label={isFullscreen ? 'Exit full screen' : 'Full screen'} onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
          </ControlButton>
        </div>
      </div>
        </>
      )}

      {!isFull && (
        <MiniOverlay
          title={title ?? ''}
          subtitle={subtitle}
          itemId={itemId}
          playing={playing}
          progress={duration > 0 ? currentTime / duration : 0}
          onToggle={togglePlay}
          onExpand={expand}
          onClose={exit}
          onPip={pipSupported ? togglePip : undefined}
        />
      )}
    </div>
  );
}

function MiniOverlay({
  title,
  subtitle,
  itemId,
  playing,
  progress,
  onToggle,
  onExpand,
  onClose,
  onPip,
}: {
  title: string;
  subtitle: string;
  itemId: string;
  playing: boolean;
  progress: number;
  onToggle: () => void;
  onExpand: () => void;
  onClose: () => void;
  onPip?: () => void;
}) {
  const btn = 'flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20';
  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-black/80 via-black/20 to-black/70 opacity-0 transition-opacity group-hover/mini:opacity-100 group-focus-within/mini:opacity-100" />
      <div className="absolute inset-x-0 top-0 z-20 flex items-start gap-2 p-2 opacity-0 transition-opacity group-hover/mini:opacity-100 group-focus-within/mini:opacity-100">
        <Link to={`/item/${itemId}`} className="min-w-0 flex-1 rounded px-1 hover:bg-white/10" title="Show details">
          <div className="truncate text-sm font-semibold">{title}</div>
          {subtitle && <div className="truncate text-xs text-white/70">{subtitle}</div>}
        </Link>
        {onPip && (
          <button onClick={onPip} className={btn} aria-label="Picture-in-picture" title="Picture-in-picture">
            <PictureInPicture2 size={18} />
          </button>
        )}
        <button onClick={onExpand} className={btn} aria-label="Expand player" title="Expand">
          <Maximize2 size={18} />
        </button>
        <button onClick={onClose} className={btn} aria-label="Stop playback" title="Stop playback">
          <X size={18} />
        </button>
      </div>
      <button
        onClick={onToggle}
        aria-label={playing ? 'Pause' : 'Play'}
        className="absolute top-1/2 left-1/2 z-20 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover/mini:opacity-100 group-focus-within/mini:opacity-100 hover:bg-accent"
      >
        {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="absolute inset-x-0 bottom-0 z-20 h-1 bg-white/20">
        <div className="h-full bg-accent" style={{ width: `${Math.min(100, progress * 100)}%` }} />
      </div>
    </>
  );
}

function ControlButton({
  label,
  onClick,
  children,
  active,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={clsx(
        'flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-white/15',
        active ? 'text-accent' : 'text-white',
      )}
    >
      {children}
    </button>
  );
}

function PanelChip({ selected, onClick, children, title }: { selected: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={selected}
      className={clsx(
        'rounded px-2 py-1 text-xs font-medium tabular-nums transition-colors',
        selected ? 'bg-accent text-accent-ink' : 'bg-white/10 text-white/80 hover:bg-white/20',
      )}
    >
      {children}
    </button>
  );
}

function PanelIconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded bg-white/10 text-white/90 transition-colors hover:bg-white/20"
    >
      {children}
    </button>
  );
}

function formatSubtitleDelay(seconds: number): string {
  return `${seconds > 0 ? '+' : ''}${seconds.toFixed(1)} s`;
}

function formatAudioDelay(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  return `${ms > 0 ? '+' : ''}${ms} ms`;
}

/** Step buttons, the current value and a slider for a timing offset. */
function DelayControl({
  value,
  onChange,
  min,
  max,
  sliderMin,
  sliderMax,
  step,
  format,
  lessLabel,
  moreLabel,
  sliderLabel,
  testId,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** The slider may cover less than the full range; the buttons reach the rest. */
  sliderMin: number;
  sliderMax: number;
  step: number;
  format: (value: number) => string;
  lessLabel: string;
  moreLabel: string;
  sliderLabel: string;
  testId: string;
}) {
  const set = (v: number) => onChange(clampStep(v, min, max));
  return (
    <div className="px-4 pt-1 pb-2">
      <div className="flex items-center gap-2">
        <PanelIconButton label={lessLabel} onClick={() => set(value - step)}>
          <Minus size={16} />
        </PanelIconButton>
        <span className="w-20 text-center text-sm tabular-nums" data-testid={testId}>
          {format(value)}
        </span>
        <PanelIconButton label={moreLabel} onClick={() => set(value + step)}>
          <Plus size={16} />
        </PanelIconButton>
        {value !== 0 && (
          <button onClick={() => onChange(0)} className="ml-auto rounded px-2 py-1 text-xs text-white/70 hover:bg-white/10">
            Reset
          </button>
        )}
      </div>
      <input
        type="range"
        min={sliderMin}
        max={sliderMax}
        step={step}
        value={Math.min(sliderMax, Math.max(sliderMin, value))}
        onChange={(e) => set(Number(e.target.value))}
        aria-label={sliderLabel}
        className="mt-3 block w-full"
      />
      <div className="mt-0.5 flex justify-between text-[10px] text-white/40 tabular-nums">
        <span>{format(sliderMin)}</span>
        <span>{format(sliderMax)}</span>
      </div>
    </div>
  );
}

function Panel({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div
      className={clsx(
        // On phones the panel is pinned to the screen edge: next to its button it would run off the left side.
        'animate-pop-in absolute right-0 bottom-14 max-h-[60vh] overflow-y-auto rounded-lg bg-base-850/95 py-1 shadow-2xl ring-1 ring-white/10 backdrop-blur max-sm:fixed max-sm:right-3 max-sm:bottom-20',
        wide ? 'w-96 max-w-[calc(100vw-2rem)]' : 'w-72',
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="py-1">
      <div className="px-4 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-white/40 uppercase">{title}</div>
      {children}
    </div>
  );
}

function PanelOption({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-white/10',
        selected ? 'text-accent' : 'text-white/90',
      )}
    >
      <Check size={16} className={clsx('shrink-0', !selected && 'invisible')} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

function UpNextCard({
  item,
  seconds,
  raised,
  onPlay,
  onCancel,
}: {
  item: BaseItemDto;
  /** Countdown until auto-play, or null when auto-play is off. */
  seconds: number | null;
  raised: boolean;
  onPlay: () => void;
  onCancel: () => void;
}) {
  const api = useApi();
  const src = imageSrc(api, cardImage(item, 'landscape'), 480);
  return (
    <div
      className={clsx(
        'animate-pop-in absolute right-6 z-20 w-80 overflow-hidden rounded-lg bg-base-850/95 shadow-2xl ring-1 ring-white/10 backdrop-blur transition-all',
        raised ? 'bottom-36' : 'bottom-8',
      )}
    >
      <div className="relative aspect-video bg-base-800">
        <Img src={src} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute bottom-2 left-3 text-xs font-semibold tracking-wider text-accent uppercase">
          {seconds === null ? 'Up next' : `Up next in ${seconds}s`}
        </div>
      </div>
      <div className="p-3">
        <div className="truncate font-semibold">{item.Type === 'Episode' ? item.SeriesName : item.Name}</div>
        {item.Type === 'Episode' && (
          <div className="truncate text-sm text-muted">
            {episodeLabel(item)} · {item.Name}
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <button
            onClick={onPlay}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent py-2 text-sm font-semibold text-accent-ink hover:bg-accent-hover"
          >
            <Play size={16} fill="currentColor" /> Play now
          </button>
          <button onClick={onCancel} className="rounded-md bg-white/10 px-4 py-2 text-sm hover:bg-white/20">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
