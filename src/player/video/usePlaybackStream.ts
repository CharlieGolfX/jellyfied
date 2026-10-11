import Hls, { ErrorTypes, Events } from 'hls.js';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { generateId } from '@/api/device';
import type { BaseItemDto, MediaStream, PlaybackInfoResponse } from '@/api/types';
import { useApi, useSession } from '@/auth/AuthProvider';
import { errorMessage } from '@/components/ui/Toast';
import { secondsToTicks, ticksToSeconds } from '@/lib/format';
import { useAudioPlayer } from '../AudioPlayerProvider';
import { buildDeviceProfile, MAX_BITRATE } from '../deviceProfile';
import { reportPlaybackProgress, reportPlaybackStart, reportPlaybackStopped, stopTranscoding, type PlayMethod } from '../reporting';
import { useSyncPlayManager } from '../SyncPlayProvider';
import { recallTracks, rememberAudioTrack, rememberSubtitleTrack } from '../trackMemory';
import type { VideoPlayerState } from '../usePlay';
import { BITRATE_KEY, readNumber, streamName, type ActiveStream, type LoadOptions } from './shared';

/**
 * Everything between the video element and the server for one playback: asking for a stream,
 * attaching it (directly or through hls.js), text subtitles, falling back to a transcode,
 * reporting progress, and switching audio track, subtitles or quality.
 */
export function usePlaybackStream({
  itemId,
  item,
  navState,
  videoRef,
  seriesId,
  rememberAudio,
  rememberSubtitles,
}: {
  itemId: string;
  item: BaseItemDto | undefined;
  navState: VideoPlayerState;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Set for episodes: the show whose track choice is remembered. */
  seriesId: string | null | undefined;
  rememberAudio: boolean;
  rememberSubtitles: boolean;
}) {
  const api = useApi();
  const { userId } = useSession();
  const audioPlayer = useAudioPlayer();
  const syncManager = useSyncPlayManager();
  const syncItemId = navState.syncPlaylistItemId;

  const hlsRef = useRef<Hls | null>(null);
  const streamRef = useRef<ActiveStream | null>(null);
  const startedRef = useRef(false);
  const loadToken = useRef(0);
  const fallbackTried = useRef(false);
  const subtitleUrlRef = useRef<string | null>(null);
  const subtitleTrackRef = useRef<HTMLTrackElement | null>(null);

  const [stream, setStream] = useState<ActiveStream | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  /** A text subtitle track is attached (drawn by SubtitleOverlay). */
  const [textSubtitles, setTextSubtitles] = useState(false);
  const [maxBitrate, setMaxBitrate] = useState(() => readNumber(BITRATE_KEY, MAX_BITRATE));

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
    [api, itemId, videoRef],
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
  }, [videoRef]);

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
    [api, clearSubtitles, videoRef],
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
    [api, item, userId, endSession, destroyHls, clearSubtitles, attachSubtitle, syncItemId, syncManager, videoRef],
  );

  // SyncPlay: hand the video element to the group manager for as long as this player is open.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !syncItemId || !syncManager) return;
    return syncManager.attach(video, syncItemId);
  }, [syncItemId, syncManager, videoRef]);

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
  }, [endSession, destroyHls, clearSubtitles, videoRef]);

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
  }, [api, itemId, load, maxBitrate, videoRef]);

  // ---- Track switching -----------------------------------------------------
  const sourceStreams = stream?.source.MediaStreams ?? [];
  const audioStreams = sourceStreams.filter((s) => s.Type === 'Audio');
  const subtitleStreams = sourceStreams.filter((s) => s.Type === 'Subtitle');

  const changeAudio = (index: number) => {
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

  return {
    stream,
    loading,
    error,
    playing,
    currentTime,
    setCurrentTime,
    duration,
    buffered,
    textSubtitles,
    maxBitrate,
    audioStreams,
    subtitleStreams,
    load,
    streamRef,
    hlsRef,
    subtitleTrackRef,
    changeAudio,
    changeSubtitle,
    changeQuality,
    retry,
    retryTranscode,
  };
}
