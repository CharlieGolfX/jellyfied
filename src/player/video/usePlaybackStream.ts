import type Hls from 'hls.js';
import { hlsJsSupported, nativeHlsSupported, playsHlsNatively } from './hlsSupport';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { generateId, isChromium } from '@/api/device';
import type { BaseItemDto, MediaStream, PlaybackInfoResponse } from '@/api/types';
import { useApi, useSession } from '@/auth/AuthProvider';
import { errorMessage } from '@/components/ui/Toast';
import { secondsToTicks, ticksToSeconds } from '@/lib/format';
import { hasAudioGraph } from '../audioDelay';
import { useAudioPlayer } from '../AudioPlayerProvider';
import { buildDeviceProfile, canRenderAss, MAX_BITRATE, type SubtitleMode } from '../deviceProfile';
import { getSubtitleStyle } from '../subtitleStyle';
import { reportPlaybackProgress, reportPlaybackStart, reportPlaybackStopped, stopTranscoding, type PlayMethod } from '../reporting';
import { useSyncPlayManager } from '../SyncPlayProvider';
import { recallTracks, rememberAudioTrack, rememberSubtitleTrack } from '../trackMemory';
import type { VideoPlayerState } from '../usePlay';
import { BITRATE_KEY, readNumber, streamName, type ActiveStream, type LoadOptions } from './shared';
import {
  createAssSubtitles,
  createPgsSubtitles,
  createVobSubSubtitles,
  isFontAttachment,
  isVobSub,
  plainTextUrl,
  sameDelivery,
  subtitleContent,
  subtitleFormat,
  subtitleModeFor,
  type CanvasSubtitles,
  type SubtitleKind,
} from './subtitleRenderers';
import type { ReadBytes } from './matroska';
import { useLatest } from '@/lib/useLatest';
import { t } from '@/i18n';

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
  assLayerRef,
  pgsLayerRef,
  subtitleDelay,
  inPip,
  airPlay,
  audioDelayed,
}: {
  itemId: string;
  item: BaseItemDto | undefined;
  navState: VideoPlayerState;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Set for episodes: the show whose track choice is remembered. */
  seriesId: string | null | undefined;
  rememberAudio: boolean;
  rememberSubtitles: boolean;
  /** Covers the whole player; styled subtitles are drawn in it. */
  assLayerRef: RefObject<HTMLElement | null>;
  /** Covers exactly the video element; image subtitles are drawn in it. */
  pgsLayerRef: RefObject<HTMLElement | null>;
  /** Seconds the subtitles are shifted: positive = later. */
  subtitleDelay: number;
  /** The picture is in a picture-in-picture window. */
  inPip: boolean;
  /** The picture is being sent to an AirPlay device. */
  airPlay: boolean;
  /** An audio delay is set. */
  audioDelayed: boolean;
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
  /** Styled or image subtitles that draw themselves on a canvas. */
  const canvasSubtitlesRef = useRef<CanvasSubtitles | null>(null);
  /** The delay currently set, for subtitles that are attached later. */
  const subtitleDelayRef = useLatest(subtitleDelay);
  /** Formats that could not be drawn here during this playback: the server converts them from then on. */
  const undrawable = useRef(new Set<CanvasFormat>());
  const inPipRef = useLatest(inPip);
  const airPlayRef = useLatest(airPlay);
  const audioDelayedRef = useLatest(audioDelayed);
  /** Set when the browser's own HLS player failed during this playback: hls.js takes over. */
  const nativeHlsFailed = useRef(false);
  /**
   * Set when the browser could not take the file's own video, copied into a stream, during this
   * playback: the server encodes the video from then on.
   */
  const videoCopyFailed = useRef(false);

  /** Styled subtitles are shown as plain text: by choice, or because they can't be drawn here. */
  const plainStyled = useCallback(() => !getSubtitleStyle().styled || undrawable.current.has('ass') || !canRenderAss(), []);

  /** How a subtitle track (or none) has to be asked for, with the picture where it is now. */
  const subtitleModeOf = useCallback(
    (track: MediaStream | undefined): SubtitleMode => {
      let content = track ? subtitleContent(track.Codec) : undefined;
      if (content === 'styled' && plainStyled()) content = 'text';
      // Chromium's picture-in-picture window shows the picture only, not the browser's own subtitles.
      return subtitleModeFor({ airPlay: airPlayRef.current, pip: inPipRef.current, pipDrawsText: !isChromium() }, content);
    },
    [airPlayRef, inPipRef, plainStyled],
  );

  const [stream, setStream] = useState<ActiveStream | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  /** How the selected subtitle track is drawn: 'text' by SubtitleOverlay, 'ass' and 'pgs' on a canvas. */
  const [subtitleKind, setSubtitleKind] = useState<SubtitleKind>('none');
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
      // Live TV: free the tuner.
      if (s.source.LiveStreamId) {
        void api.request('POST', '/LiveStreams/Close', { query: { liveStreamId: s.source.LiveStreamId }, keepalive }).catch(() => {});
      }
    },
    [api, itemId, videoRef],
  );

  const clearSubtitles = useCallback(() => {
    const video = videoRef.current;
    if (video) video.querySelectorAll('track').forEach((track) => track.remove());
    subtitleTrackRef.current = null;
    canvasSubtitlesRef.current?.destroy();
    canvasSubtitlesRef.current = null;
    setSubtitleKind('none');
    if (subtitleUrlRef.current) {
      URL.revokeObjectURL(subtitleUrlRef.current);
      subtitleUrlRef.current = null;
    }
  }, [videoRef]);

  const attachSubtitle = useCallback(
    /** Resolves to a format when that format couldn't be drawn here and the server has to convert it. */
    async (s: MediaStream, token: number): Promise<'ok' | 'failed' | CanvasFormat> => {
      const video = videoRef.current;
      if (!video || !s.DeliveryUrl) return 'failed';
      let url = /^https?:\/\//i.test(s.DeliveryUrl) ? s.DeliveryUrl : api.serverUrl + s.DeliveryUrl;
      // Styled subtitles that are to be shown as plain text: the server has that version next to the original.
      if (subtitleFormat(url) === 'ass' && (plainStyled() || streamRef.current?.subtitleMode === 'text')) url = plainTextUrl(url);
      const format = isVobSub(s.Codec) ? 'vobsub' : subtitleFormat(url);
      try {
        // The server has no file to deliver for VobSub: those are read out of the video file.
        const res = format === 'vobsub' ? null : await fetch(url, { headers: { Authorization: api.authorizationHeader() } });
        if (res && !res.ok) throw new Error(t('player.video.stream.subtitleRequestFailed', { status: res.status }));
        if (format !== 'vtt') {
          const layer = format === 'ass' ? assLayerRef.current : pgsLayerRef.current;
          const source = streamRef.current?.source;
          let subtitles: CanvasSubtitles;
          try {
            if (!layer || !source) throw new Error(t('player.video.stream.noSubtitleLayer'));
            if (format === 'ass') {
              subtitles = await createAssSubtitles({
                video,
                layer,
                content: await res!.text(),
                fonts: (source.MediaAttachments ?? [])
                  .filter(isFontAttachment)
                  .map((a) => api.url(`/Videos/${itemId}/${source.Id}/Attachments/${a.Index}`, undefined, true)),
                delay: subtitleDelayRef.current,
              });
            } else if (format === 'pgs') {
              subtitles = await createPgsSubtitles({ video, layer, data: await res!.arrayBuffer(), delay: subtitleDelayRef.current });
            } else {
              if (s.IsExternal) throw new Error('VobSub subtitles in a file of their own');
              const inFile = (source.MediaStreams ?? []).filter((m) => m.Type === 'Subtitle' && !m.IsExternal && isVobSub(m.Codec));
              subtitles = await createVobSubSubtitles({
                video,
                layer,
                read: fileReader(
                  api.url(
                    `/Videos/${itemId}/stream`,
                    { static: true, mediaSourceId: source.Id, deviceId: api.deviceId, Tag: source.ETag ?? undefined },
                    true,
                  ),
                ),
                streamIndex: s.Index,
                position: inFile.indexOf(s),
                delay: subtitleDelayRef.current,
              });
            }
          } catch (err) {
            console.warn(`Could not draw ${format.toUpperCase()} subtitles here`, err);
            return format;
          }
          if (token !== loadToken.current) {
            subtitles.destroy();
            return 'ok';
          }
          clearSubtitles();
          canvasSubtitlesRef.current = subtitles;
          setSubtitleKind(format);
          return 'ok';
        }
        const text = await res!.text();
        if (token !== loadToken.current) return 'ok';
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
        setSubtitleKind('text');
        return 'ok';
      } catch (err) {
        console.warn('Failed to load subtitles', err);
        return 'failed';
      }
    },
    [api, itemId, clearSubtitles, plainStyled, videoRef, assLayerRef, pgsLayerRef, subtitleDelayRef],
  );

  /** Shows a subtitle track, and when it can't be drawn here, in the form the server can turn it into. */
  const showSubtitle = useCallback(
    async (s: MediaStream, token: number, reload: () => void) => {
      const result = await attachSubtitle(s, token);
      if (result === 'ok' || result === 'failed' || token !== loadToken.current || undrawable.current.has(result)) return;
      undrawable.current.add(result);
      // Styled subtitles come as plain text from the same place. Pictures have to be burned in,
      // which takes a new stream.
      if (result === 'ass') void attachSubtitle(s, token);
      else reload();
    },
    [attachSubtitle],
  );

  const destroyHls = useCallback(() => {
    hlsRef.current?.destroy();
    hlsRef.current = null;
  }, []);

  /** Has the browser draw the text track itself (true), or leaves that to SubtitleOverlay (false). */
  const showNativeSubtitles = useCallback((show: boolean) => {
    const track = subtitleTrackRef.current?.track;
    if (track) track.mode = show ? 'showing' : 'hidden';
  }, []);
  const loadRef = useRef<((opts: LoadOptions) => Promise<void>) | null>(null);

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

      // What is known about the file before asking: enough to decide how its subtitles should come.
      const known = item.MediaSources?.find((s) => s.Id === opts.mediaSourceId) ?? item.MediaSources?.[0];
      const wantedSub =
        opts.subIndex != null && opts.subIndex >= 0
          ? known?.MediaStreams?.find((s) => s.Type === 'Subtitle' && s.Index === opts.subIndex)
          : undefined;
      const subtitleMode = subtitleModeOf(wantedSub);

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
          AllowVideoStreamCopy: !videoCopyFailed.current,
          AllowAudioStreamCopy: true,
          DeviceProfile: buildDeviceProfile(opts.bitrate, {
            subtitles: subtitleMode,
            images: !undrawable.current.has('pgs'),
            // VobSub pictures are fetched out of the file, which takes a Matroska file on the server's disk.
            vobSub:
              !undrawable.current.has('vobsub') &&
              /mkv|matroska/i.test(known?.Container ?? '') &&
              (known?.Protocol ?? 'File') === 'File' &&
              !known?.IsInfiniteStream,
          }),
        });
        if (token !== loadToken.current) return;
        if (info.ErrorCode) {
          throw new Error(
            info.ErrorCode === 'NotAllowed'
              ? t('player.video.stream.notAllowed')
              : info.ErrorCode === 'RateLimitExceeded'
                ? t('player.video.stream.bitrateLimitExceeded')
                : t('player.video.stream.noCompatibleStream'),
          );
        }
        const source = info.MediaSources.find((s) => s.Id === opts.mediaSourceId) ?? info.MediaSources[0];
        if (!source) throw new Error(t('player.video.stream.noMediaSource'));

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
          throw new Error(t('player.video.stream.cannotPlay'));
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
          subtitleMode,
          transcodeReasons: reasons,
          nativeHls:
            isHls &&
            playsHlsNatively({
              native: nativeHlsSupported(),
              hlsJs: hlsJsSupported(),
              airPlay: airPlayRef.current,
              // Sound that was once routed through Web Audio stays there for this video element.
              audioDelayed: audioDelayedRef.current || hasAudioGraph(video),
              nativeFailed: nativeHlsFailed.current,
            }),
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
        if (isHls && !active.nativeHls) {
          // Fetched now, the first time a stream needs it: files that play directly never do.
          const { default: HlsPlayer, ErrorDetails, ErrorTypes, Events } = await import('hls.js');
          if (token !== loadToken.current) return;
          const hls = new HlsPlayer({
            // A live broadcast starts at its newest part.
            startPosition: source.IsInfiniteStream ? -1 : start,
            maxBufferLength: 30,
            maxMaxBufferLength: 120,
            backBufferLength: 90,
            manifestLoadingTimeOut: 30_000,
            enableWorker: true,
          });
          hlsRef.current = hls;
          let mediaRecoveries = 0;
          /** Parts the browser took without any of their picture showing up in what it has buffered. */
          const unbuffered = new Set<number | string>();
          hls.on(Events.ERROR, (_e, data) => {
            if (token !== loadToken.current) return;
            // The browser takes parts of the stream, but none of the picture in them shows up in what
            // it has buffered. Firefox does this with HEVC copied from an "open GOP" file, for every
            // part after the first. hls.js would skip each one and fetch on and on; the server
            // encoding the video instead gives parts that each start on a clean picture.
            if (data.details === ErrorDetails.BUFFER_APPEND_NO_PROGRESS && data.parent === 'main' && data.frag) {
              unbuffered.add(data.frag.sn);
              if (unbuffered.size >= 2 && !videoCopyFailed.current) {
                videoCopyFailed.current = true;
                void loadRef.current?.({ ...opts, start: video.currentTime || start, subIndex, audioIndex });
              }
              return;
            }
            if (!data.fatal) return;
            if (data.type === ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
              mediaRecoveries++;
              hls.recoverMediaError();
              return;
            }
            setLoading(false);
            setError(
              data.type === ErrorTypes.NETWORK_ERROR
                ? t('player.video.stream.connectionLost')
                : t('player.playbackError', { details: data.details }),
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
          void showSubtitle(subStream, token, () => {
            void loadRef.current?.({ ...opts, start: video.currentTime || opts.start, subIndex, audioIndex });
          });
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
    [
      api,
      item,
      userId,
      endSession,
      destroyHls,
      clearSubtitles,
      showSubtitle,
      subtitleModeOf,
      airPlayRef,
      audioDelayedRef,
      syncItemId,
      syncManager,
      videoRef,
    ],
  );

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  // Subtitles drawn on a canvas (styled and image subtitles) take the delay themselves. The kind
  // is listed so that a track attached later gets the delay too.
  useEffect(() => {
    canvasSubtitlesRef.current?.setDelay(subtitleDelay);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [subtitleDelay, subtitleKind]);

  // The picture moved to a picture-in-picture window or an AirPlay device, or came back, or an
  // audio delay was set. AirPlay only takes a video the browser plays by itself, so a transcode that
  // hls.js is feeding is loaded again through Safari's own HLS player; the audio delay needs the
  // opposite (see playsHlsNatively). Neither window nor device carries the canvases along that
  // styled and image subtitles are drawn on, so those are asked for in a form that does travel,
  // and back afterwards.
  useEffect(() => {
    const s = streamRef.current;
    const video = videoRef.current;
    if (!s || !video) return;
    const needsNativeHls = airPlay && s.isHls && !s.nativeHls;
    const needsHlsJs = audioDelayed && !airPlay && s.isHls && s.nativeHls && hlsJsSupported();
    const track = s.subIndex >= 0 ? s.source.MediaStreams?.find((m) => m.Type === 'Subtitle' && m.Index === s.subIndex) : undefined;
    const mode = subtitleModeOf(track);
    const content = subtitleContent(track?.Codec);
    const needsOtherSubtitles = Boolean(track) && !sameDelivery(mode, s.subtitleMode, content) && !(mode === 'burn' && s.burnedSub);
    const reload = (forceTranscode?: boolean) =>
      void load({
        start: video.currentTime,
        audioIndex: s.audioIndex,
        subIndex: s.subIndex,
        bitrate: maxBitrate,
        mediaSourceId: s.source.Id,
        forceTranscode,
      });
    if (needsNativeHls || needsHlsJs || needsOtherSubtitles) {
      reload(needsNativeHls || needsHlsJs || undefined);
      return;
    }
    if (!track || mode === s.subtitleMode || s.burnedSub) return;
    // The same stream will do; only styled subtitles are fetched again, to be drawn the other way.
    const updated = { ...s, subtitleMode: mode };
    streamRef.current = updated;
    setStream(updated);
    if (content !== 'styled') return;
    clearSubtitles();
    void showSubtitle(track, loadToken.current, reload);
  }, [inPip, airPlay, audioDelayed, load, maxBitrate, subtitleModeOf, showSubtitle, clearSubtitles, videoRef]);

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
      // The counter is meant to be read at this moment: it cancels whatever is still loading.
      // oxlint-disable-next-line react-hooks/exhaustive-deps
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
      if (s.nativeHls && !airPlayRef.current && hlsJsSupported() && !nativeHlsFailed.current) {
        // The browser's own HLS player gave up on the stream: hls.js copes with more, so try that.
        nativeHlsFailed.current = true;
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
      setError(t('player.couldNotBePlayed', { reason: mediaError.message || t('player.errorCode', { code: mediaError.code }) }));
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
  }, [api, itemId, load, maxBitrate, videoRef, airPlayRef]);

  // ---- Track switching -----------------------------------------------------
  const sourceStreams = stream?.source.MediaStreams ?? [];
  const audioStreams = sourceStreams.filter((s) => s.Type === 'Audio');
  const subtitleStreams = sourceStreams.filter((s) => s.Type === 'Subtitle');

  const changeAudio = (index: number) => {
    if (!stream || index === stream.audioIndex) return;
    if (seriesId && rememberAudio)
      rememberAudioTrack(
        seriesId,
        audioStreams.find((s) => s.Index === index),
      );
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
    // A track that has to be asked for differently (see subtitleModeOf) needs a new stream.
    const mode = target ? subtitleModeOf(target) : stream.subtitleMode;
    const canSwapLocally =
      !stream.burnedSub &&
      (index === -1 || (target?.DeliveryMethod === 'External' && sameDelivery(mode, stream.subtitleMode, subtitleContent(target.Codec))));
    if (canSwapLocally) {
      const token = loadToken.current;
      clearSubtitles();
      const updated = { ...stream, subIndex: index, subtitleMode: mode };
      streamRef.current = updated;
      setStream(updated);
      if (target) {
        void showSubtitle(target, token, () => {
          void load({
            start: videoRef.current?.currentTime ?? 0,
            audioIndex: updated.audioIndex,
            subIndex: index,
            bitrate: maxBitrate,
            mediaSourceId: updated.source.Id,
          });
        });
      }
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
    subtitleKind,
    textSubtitles: subtitleKind === 'text',
    maxBitrate,
    audioStreams,
    subtitleStreams,
    load,
    streamRef,
    hlsRef,
    subtitleTrackRef,
    showNativeSubtitles,
    changeAudio,
    changeSubtitle,
    changeQuality,
    retry,
    retryTranscode,
  };
}

/** Subtitle formats that draw themselves on a canvas. */
type CanvasFormat = Exclude<SubtitleKind, 'none' | 'text'>;

/** Reads parts of a file on the server. Rejects when the server sends the whole file instead. */
function fileReader(url: string): ReadBytes {
  return async (offset, length) => {
    const res = await fetch(url, { headers: { Range: `bytes=${offset}-${offset + length - 1}` } });
    if (res.status !== 206) {
      void res.body?.cancel().catch(() => {});
      throw new Error(t('player.video.stream.subtitleRequestFailed', { status: res.status }));
    }
    return new Uint8Array(await res.arrayBuffer());
  };
}
