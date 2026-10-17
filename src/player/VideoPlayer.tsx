import clsx from 'clsx';
import { Airplay, Cast, PictureInPicture2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { generateId } from '@/api/device';
import { useItem, useMediaSegments } from '@/api/queries';
import type { ItemsResult } from '@/api/types';
import { useApi, useCurrentUser, useSession } from '@/auth/AuthProvider';
import { Spinner } from '@/components/ui/Spinner';
import { errorMessage, useToast } from '@/components/ui/Toast';
import { episodeLabel, secondsToTicks, ticksToSeconds } from '@/lib/format';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerActiveVideo, type ActiveVideo } from './activePlayer';
import { audioDelaySupported, getLastAudioDelay, hasAudioGraph, releaseAudioDelay, setAudioDelay as applyAudioDelay } from './audioDelay';
import { useAudioPlayer } from './AudioPlayerProvider';
import { castPlay, chromecastSupported, connectChromecast, useChromecast } from './chromecast';
import { useSeekSteps } from './seekSteps';
import { PlaybackInfo } from './PlaybackInfo';
import { pictureStyle, readPictureFit, storePictureFit, type PictureAspect, type PictureFit } from './picture';
import { clearSleepTimer, getSleepTimer, onSleepTimerFired, useSleepTimer } from './sleepTimer';
import { SubtitleOverlay } from './SubtitleOverlay';
import { useSyncPlay, useSyncPlayManager } from './SyncPlayProvider';
import { setPickerOpen, usePickerSupported } from './syncplayPickerApi';
import type { VideoPlayerState } from './usePlay';
import { useWakeLock } from './useWakeLock';
import { isPlayPath, useVideoSession } from './VideoSession';
import { ControlButton } from './video/controls';
import { EndsAt, SleepIndicator } from './video/indicators';
import { ChaptersMenu, PictureMenu, SettingsMenu, SubtitlesMenu } from './video/menus';
import { hlsJsSupported } from './video/hlsSupport';
import { MiniOverlay } from './video/MiniOverlay';
import { ControlBar, TopBar, type TitlePart } from './video/PlayerBars';
import { pipSupported, readNumber, SEGMENT_LABELS, VOLUME_KEY, type PlayerPanel } from './video/shared';
import { ShortcutsHelp } from './video/ShortcutsHelp';
import { UpNextCard } from './video/UpNextCard';
import { useAirPlay } from './video/useAirPlay';
import { usePlaybackStream } from './video/usePlaybackStream';
import {
  useActiveSegment,
  useAutoHide,
  useFullscreen,
  useOsd,
  usePictureInPicture,
  usePlayerSizes,
  useTrickplayPreview,
} from './video/usePlayerChrome';
import { usePlayerShortcuts } from './video/usePlayerShortcuts';
import { useTouchGestures } from './video/useTouchGestures';
import { useVideoMediaSession } from './video/useVideoMediaSession';
import { useLatest } from '@/lib/useLatest';
import { t } from '@/i18n';

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
  const { userId, serverId } = useSession();
  const navigate = useNavigate();
  const { mode, start, close, expand, minimize } = useVideoSession();
  const isFull = mode === 'full';
  const audioPlayer = useAudioPlayer();
  const { data: item, error: itemError } = useItem(itemId);
  const { data: user } = useCurrentUser();
  const segments = useMediaSegments(itemId);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  /** Styled (ASS) subtitles draw in this layer, image (PGS) subtitles in the one that follows the picture. */
  const assLayerRef = useRef<HTMLDivElement>(null);
  const pgsLayerRef = useRef<HTMLDivElement>(null);
  const [seekSteps] = useSeekSteps();
  const toast = useToast();
  const sleep = useSleepTimer();
  // SyncPlay: this playback belongs to a group and follows the server's commands.
  const syncManager = useSyncPlayManager();
  const sync = useSyncPlay();
  const syncItemId = navState.syncPlaylistItemId;
  const inSync = Boolean(syncItemId) && sync.following && sync.playlistItemId === syncItemId;
  const pickerSupported = usePickerSupported();

  const [volume, setVolume] = useState(() => Math.min(1, readNumber(VOLUME_KEY, 1)));
  const [muted, setMuted] = useState(false);
  const [panel, setPanel] = useState<PlayerPanel>('none');
  /** Seconds the subtitles are shifted: positive = later. */
  const [subtitleDelay, setSubtitleDelay] = useState(0);
  /** Seconds the sound is held back. Carried over to the next video. */
  const [audioDelay, setAudioDelay] = useState(getLastAudioDelay);
  const [pictureFit, setPictureFit] = useState<PictureFit>(readPictureFit);
  const [pictureAspect, setPictureAspect] = useState<PictureAspect>('auto');
  const [pictureZoom, setPictureZoom] = useState(1);
  const { box: boxSize, video: videoSize } = usePlayerSizes(containerRef, videoRef);
  const [showInfo, setShowInfo] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [upNextDismissed, setUpNextDismissed] = useState(false);
  const [speed, setSpeed] = useState(1);
  const { inPip, togglePip } = usePictureInPicture(videoRef);
  const { isFullscreen, toggleFullscreen } = useFullscreen(containerRef, videoRef);
  const { visible: controlsVisible, poke, hide: hideControls } = useAutoHide();
  const { osd, flash } = useOsd();

  // Episodes remember the audio and subtitle track per show (see trackMemory.ts), following the
  // user's "Remember audio/subtitle selections" preferences.
  const seriesId = item?.Type === 'Episode' ? item.SeriesId : undefined;
  const rememberAudio = user?.Configuration?.RememberAudioSelections !== false;
  const rememberSubtitles = user?.Configuration?.RememberSubtitleSelections !== false;

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
  const autoAdvance = !sleep.endOfVideo && (item?.Type !== 'Episode' || user?.Configuration?.EnableNextEpisodeAutoPlay !== false);

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

  // ---- Stream ------------------------------------------------------------
  const airPlay = useAirPlay(videoRef);
  const {
    stream,
    loading,
    error,
    playing,
    currentTime,
    setCurrentTime,
    duration,
    buffered,
    subtitleKind,
    textSubtitles,
    maxBitrate,
    audioStreams,
    subtitleStreams,
    load,
    streamRef,
    hlsRef,
    subtitleTrackRef,
    showNativeSubtitles,
    changeAudio: switchAudio,
    changeSubtitle: switchSubtitle,
    changeQuality: switchQuality,
    retry,
    retryTranscode,
  } = usePlaybackStream({
    itemId,
    item,
    navState,
    videoRef,
    seriesId,
    rememberAudio,
    rememberSubtitles,
    assLayerRef,
    pgsLayerRef,
    subtitleDelay,
    inPip,
    airPlay: airPlay.active,
    audioDelayed: audioDelay !== 0,
  });
  // Safari's own HLS player can't route its sound through Web Audio. Where hls.js can play the
  // stream instead, it takes over once a delay is set; it can't on iPhone, or for AirPlay.
  const audioDelayAvailable = audioDelaySupported() && !(stream?.isHls && (airPlay.active || !hlsJsSupported()));
  /** The subtitles are drawn here, not burned in, so they can be shifted in time. */
  const subtitleTiming = subtitleKind !== 'none';

  useWakeLock(playing);

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
      toast.error(t('player.videoPlayer.audioDelayUnavailable'));
      setAudioDelay(0);
    }
  }, [audioDelay, audioDelayAvailable, api, load, maxBitrate, toast, streamRef, hlsRef]);
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (video) releaseAudioDelay(video);
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

  // Our subtitle overlay isn't part of the picture-in-picture window, so let the browser draw the
  // subtitles there instead.
  useEffect(() => {
    showNativeSubtitles(inPip);
    // Also when a text track is attached while already in picture-in-picture.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [inPip, textSubtitles, showNativeSubtitles]);

  // Sleep timer ran out: pause.
  useEffect(
    () =>
      onSleepTimerFired(() => {
        videoRef.current?.pause();
        toast.info(t('player.videoPlayer.sleepTimerPlaybackPaused'));
      }),
    [toast],
  );

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

  const seekTo = useCallback(
    (time: number) => {
      const video = videoRef.current;
      if (!video) return;
      const max = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Infinity;
      video.currentTime = Math.min(Math.max(0, time), max - 0.25);
      setCurrentTime(video.currentTime);
    },
    [setCurrentTime],
  );

  const skip = useCallback((delta: number) => seekTo((videoRef.current?.currentTime ?? 0) + delta), [seekTo]);

  const showControls = controlsVisible || !playing || panel !== 'none' || Boolean(error);

  // Keyboard shortcuts (full-screen player only; the mini player must not hijack page keys).
  usePlayerShortcuts({
    isFull,
    togglePlay,
    skip,
    toggleFullscreen,
    togglePip,
    minimize,
    goNext,
    nextId,
    panel,
    setPanel,
    poke,
    flash,
    speed,
    setSpeed,
    inSync,
    subtitleTiming,
    subtitleDelay,
    setSubtitleDelay,
    audioDelay,
    setAudioDelay,
    audioDelayAvailable,
    setVolume,
    setMuted,
    setShowInfo,
    showShortcuts,
    setShowShortcuts,
    steps: seekSteps,
  });

  const gestures = useTouchGestures({
    enabled: isFull,
    videoRef,
    containerRef,
    controlsShown: showControls,
    hideControls,
    menuOpen: panel !== 'none',
    closeMenu: () => setPanel('none'),
    skip,
    seekTo,
    toggleFullscreen,
    flash,
    back: seekSteps.back,
    forward: seekSteps.forward,
  });

  // Chromecast: once one is connected while this video is open, the video moves over to it.
  const cast = useChromecast();
  const castConnected = cast.status === 'connected';
  const castWasConnected = useRef(castConnected);
  useEffect(() => {
    const was = castWasConnected.current;
    castWasConnected.current = castConnected;
    if (was || !castConnected || !item || inSync) return;
    const s = streamRef.current;
    castPlay({ api, serverId }, [item], {
      startPositionTicks: secondsToTicks(videoRef.current?.currentTime ?? 0),
      mediaSourceId: s?.source.Id,
      audioStreamIndex: s?.audioIndex,
      subtitleStreamIndex: s && s.subIndex >= 0 ? s.subIndex : undefined,
    })
      .then(() => {
        toast.info(t('player.videoPlayer.playingOn', { deviceName: cast.deviceName }));
        exit();
      })
      .catch((err: unknown) => toast.error(err));
  }, [castConnected, cast.deviceName, item, inSync, api, serverId, streamRef, toast, exit]);

  // Collapsing into the mini player: close menus and leave browser full screen.
  const [wasFull, setWasFull] = useState(isFull);
  if (wasFull !== isFull) {
    setWasFull(isFull);
    if (!isFull) {
      setPanel('none');
      setShowShortcuts(false);
    }
  }
  useEffect(() => {
    if (!isFull && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, [isFull]);

  // Starting music pauses the video (only one thing plays at a time).
  useEffect(() => {
    if (audioPlayer.isPlaying) videoRef.current?.pause();
  }, [audioPlayer.isPlaying]);

  useVideoMediaSession({ api, item, videoRef, playing, nextId, togglePlay, skip, seekTo, goNext, steps: seekSteps });

  // Single click toggles playback, double click toggles fullscreen.
  const clickTimer = useRef<number | undefined>(undefined);
  const onSurfaceClick = () => {
    if (!isFull) {
      expand();
      return;
    }
    // Taps are handled as touch gestures; this is the mouse click the browser reports after one.
    if (gestures.fromTouch()) return;
    if (panel !== 'none') {
      setPanel('none');
      return;
    }
    window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(togglePlay, 220);
  };
  const onSurfaceDoubleClick = () => {
    window.clearTimeout(clickTimer.current);
    if (!isFull || gestures.fromTouch()) return;
    toggleFullscreen();
  };

  // ---- Track switching -----------------------------------------------------
  const changeAudio = (index: number) => {
    setPanel('none');
    switchAudio(index);
  };
  const changeSubtitle = (index: number) => {
    setPanel('none');
    switchSubtitle(index);
  };
  const changeQuality = (bitrate: number) => {
    setPanel('none');
    switchQuality(bitrate);
  };

  // Let remote control (other devices) drive this player. The handle is registered once and
  // always calls the latest closures.
  const controls = useLatest<Omit<ActiveVideo, 'itemId' | 'video'> | null>({
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
  });
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
  }, [itemId, controls]);

  // ---- Derived UI state ------------------------------------------------------
  const { segment: activeSegment, fresh: skipFresh } = useActiveSegment(segments.data?.Items, currentTime);
  const skipVisible = skipFresh || showControls;

  const remaining = duration - currentTime;
  const inOutro = activeSegment?.Type === 'Outro';
  const showUpNext = Boolean(nextItem) && !upNextDismissed && duration > 60 && (remaining <= 25 || inOutro) && !error;
  const chapterMarks = useMemo(
    () => (item?.Chapters ?? []).map((c) => ticksToSeconds(c.StartPositionTicks)).filter((seconds) => seconds > 0),
    [item?.Chapters],
  );

  const chapters = useMemo(
    () =>
      (item?.Chapters ?? []).map((c, index) => ({
        index,
        start: ticksToSeconds(c.StartPositionTicks),
        name: c.Name || t('player.chapterNumber', { number: index + 1 }),
        tag: c.ImageTag,
      })),
    [item?.Chapters],
  );
  const currentChapter = chapters.reduce((found, c) => (c.start <= currentTime + 0.25 ? c.index : found), -1);

  const renderTrickplay = useTrickplayPreview(api, item, itemId, stream?.source.Id);

  const changePictureFit = (fit: PictureFit) => {
    setPictureFit(fit);
    storePictureFit(fit);
  };
  // The mini player always shows the whole picture.
  const picture = isFull
    ? pictureStyle({ fit: pictureFit, aspect: pictureAspect, zoom: pictureZoom, box: boxSize, video: videoSize })
    : undefined;
  const pictureChanged = pictureFit !== 'fit' || pictureAspect !== 'auto' || pictureZoom !== 1;

  // The full-screen player names the tab; the mini player leaves that to the page underneath.
  usePageTitle(
    isFull && item ? (item.Type === 'Episode' ? `${item.SeriesName ?? ''} ${episodeLabel(item)}`.trim() : item.Name) : undefined,
  );

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
          {isFull ? t('player.videoPlayer.goBack') : t('common.close')}
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

  // The same, in pieces that lead to their pages: the show, its season and the episode, or the film.
  const itemPage = (id?: string | null) => (id ? `/item/${id}` : undefined);
  const titleParts: TitlePart =
    item?.Type === 'Episode'
      ? { label: item.SeriesName ?? '', to: itemPage(item.SeriesId) }
      : { label: item?.Name ?? '', to: itemPage(item?.Id) };
  const subtitleParts: TitlePart[] = [];
  if (item?.Type === 'Episode') {
    const s = item.ParentIndexNumber;
    const e = item.IndexNumber;
    if (s !== undefined && s !== null) subtitleParts.push({ label: `S${s}`, to: itemPage(item.SeasonId) });
    const episode = [
      e !== undefined && e !== null ? `E${e}${item.IndexNumberEnd ? `-${item.IndexNumberEnd}` : ''}` : '',
      item.Name ?? '',
    ].filter(Boolean);
    if (episode.length) subtitleParts.push({ label: episode.join(' · '), to: itemPage(item.Id) });
  } else if (item?.ProductionYear) {
    subtitleParts.push({ label: String(item.ProductionYear) });
  }
  /** Opens a page in place of the full-screen player, which carries on in the mini player. */
  const openPage = (to: string) => navigate(to, { replace: true });

  return (
    <div
      ref={containerRef}
      className={clsx(frameClass, 'select-none', isFull && !showControls && 'cursor-none')}
      onMouseMove={isFull ? poke : undefined}
      onTouchStart={isFull ? poke : undefined}
    >
      {/* A resized picture may not cover the player: keep clicks next to it working. */}
      {picture && <div className="absolute inset-0" onClick={onSurfaceClick} onDoubleClick={onSurfaceDoubleClick} {...gestures.handlers} />}
      <video
        ref={videoRef}
        data-testid="video"
        className={clsx('absolute bg-black', picture ? 'max-w-none' : 'inset-0 h-full w-full object-contain', !isFull && 'cursor-pointer')}
        style={picture}
        playsInline
        preload="auto"
        onClick={onSurfaceClick}
        onDoubleClick={onSurfaceDoubleClick}
        {...gestures.handlers}
      />
      {/* Canvases for subtitles that draw themselves. Image subtitles sit in a box that matches the
          video element; styled ones find the picture on their own. */}
      <div
        ref={pgsLayerRef}
        className={clsx('pointer-events-none absolute', picture ? 'max-w-none' : 'inset-0 h-full w-full object-contain')}
        style={picture}
      />
      <div ref={assLayerRef} className="pointer-events-none absolute inset-0" />

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
              {t('player.videoPlayer.retry')}
            </button>
            {isFull && stream?.method !== 'Transcode' && (
              <button onClick={retryTranscode} className="rounded-md bg-white/10 px-4 py-2 hover:bg-white/20">
                {t('player.videoPlayer.tryTranscoding')}
              </button>
            )}
            <button onClick={exit} className="rounded-md bg-white/10 px-4 py-2 hover:bg-white/20">
              {isFull ? t('player.videoPlayer.goBack') : t('common.close')}
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
              tabIndex={skipVisible ? undefined : -1}
              className={clsx(
                'absolute right-8 z-10 rounded-md bg-white/90 px-5 py-2.5 font-semibold text-black shadow-xl transition-all duration-300 hover:bg-white',
                // Clear of the controls' gradient, which would otherwise swallow clicks on its lower half.
                showControls ? 'bottom-40' : 'bottom-10',
                !skipVisible && 'pointer-events-none opacity-0',
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

          {showShortcuts && <ShortcutsHelp steps={seekSteps} onClose={() => setShowShortcuts(false)} />}

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

          <TopBar
            visible={showControls}
            title={titleParts}
            subtitle={subtitleParts}
            group={sync.group}
            onOpenPicker={sync.group && pickerSupported ? () => setPickerOpen(true) : undefined}
            onNavigate={openPage}
            onMinimize={minimize}
            onExit={exit}
          />

          <ControlBar
            visible={showControls}
            playing={playing}
            currentTime={currentTime}
            duration={duration}
            buffered={buffered}
            markers={chapterMarks}
            renderPreview={renderTrickplay}
            seekSteps={seekSteps}
            muted={muted}
            volume={volume}
            isFullscreen={isFullscreen}
            onSeek={seekTo}
            onTogglePlay={togglePlay}
            onSkip={skip}
            onNext={nextId ? goNext : undefined}
            onMutedChange={setMuted}
            onVolumeChange={setVolume}
            onToggleFullscreen={toggleFullscreen}
            indicators={
              <>
                <SleepIndicator />
                {duration > 0 && remaining > 0 && <EndsAt remaining={remaining} speed={inSync ? 1 : speed} />}
                {speed !== 1 && !inSync && <span className="mr-1 text-sm font-semibold text-accent tabular-nums">{speed}×</span>}
                {stream && (
                  <span className="mr-2 hidden rounded border border-white/20 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-white/60 uppercase sm:inline">
                    {stream.method === 'DirectPlay'
                      ? t('player.videoPlayer.directPlay')
                      : stream.method === 'DirectStream'
                        ? t('player.videoPlayer.directStream')
                        : t('player.videoPlayer.transcode')}
                  </span>
                )}
              </>
            }
          >
            {chapters.length > 1 && (
              <ChaptersMenu
                open={panel === 'chapters'}
                onToggle={() => setPanel((p) => (p === 'chapters' ? 'none' : 'chapters'))}
                itemId={itemId}
                chapters={chapters}
                current={currentChapter}
                onSelect={(c) => {
                  seekTo(c.start);
                  setPanel('none');
                }}
              />
            )}
            <SubtitlesMenu
              open={panel === 'subtitles'}
              onToggle={() => setPanel((p) => (p === 'subtitles' ? 'none' : 'subtitles'))}
              stream={stream}
              subtitleStreams={subtitleStreams}
              onSelect={changeSubtitle}
              kind={subtitleKind}
              delay={subtitleDelay}
              onDelayChange={setSubtitleDelay}
            />
            <PictureMenu
              open={panel === 'picture'}
              onToggle={() => setPanel((p) => (p === 'picture' ? 'none' : 'picture'))}
              fit={pictureFit}
              aspect={pictureAspect}
              zoom={pictureZoom}
              changed={pictureChanged}
              onFitChange={changePictureFit}
              onAspectChange={setPictureAspect}
              onZoomChange={setPictureZoom}
            />
            <SettingsMenu
              open={panel === 'settings'}
              onToggle={() => setPanel((p) => (p === 'settings' ? 'none' : 'settings'))}
              stream={stream}
              audioStreams={audioStreams}
              onAudioSelect={changeAudio}
              audioDelay={audioDelay}
              onAudioDelayChange={setAudioDelay}
              audioDelayAvailable={audioDelayAvailable}
              inSync={inSync}
              speed={speed}
              onSpeedChange={setSpeed}
              maxBitrate={maxBitrate}
              onQualityChange={changeQuality}
              showInfo={showInfo}
              onToggleInfo={() => {
                setShowInfo((v) => !v);
                setPanel('none');
              }}
              onShowShortcuts={() => {
                setShowShortcuts(true);
                setPanel('none');
              }}
            />
            {airPlay.available && (
              <ControlButton
                label={airPlay.active ? t('player.videoPlayer.airplayActive') : t('player.videoPlayer.airplay')}
                onClick={airPlay.pick}
                active={airPlay.active}
              >
                <Airplay size={24} />
              </ControlButton>
            )}
            {chromecastSupported && !inSync && (
              <ControlButton
                label={t('player.videoPlayer.playOnChromecast')}
                onClick={() => void connectChromecast()}
                active={cast.status === 'loading'}
              >
                <Cast size={24} />
              </ControlButton>
            )}
            {pipSupported && (
              <ControlButton
                label={inPip ? t('player.videoPlayer.exitPictureInPicture') : t('player.videoPlayer.pictureInPicture')}
                onClick={togglePip}
                active={inPip}
              >
                <PictureInPicture2 size={24} />
              </ControlButton>
            )}
          </ControlBar>
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
