import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { isChromium } from '@/api/device';
import type { MediaStream } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { t } from '@/i18n';
import { useLatest } from '@/lib/useLatest';
import { canRenderAss, type SubtitleMode } from '../deviceProfile';
import { getSubtitleStyle } from '../subtitleStyle';
import type { ReadBytes } from './matroska';
import { streamName, type ActiveStream } from './shared';
import {
  createAssSubtitles,
  createPgsSubtitles,
  createVobSubSubtitles,
  isFontAttachment,
  isVobSub,
  plainTextUrl,
  subtitleContent,
  subtitleFormat,
  subtitleModeFor,
  type CanvasSubtitles,
  type SubtitleKind,
} from './subtitleRenderers';

/**
 * The subtitles of one playback: fetching the selected track and drawing it (as text over the
 * video, or on a canvas for styled and image subtitles), and working out how a track has to be
 * asked for from the server.
 */
export function useStreamSubtitles({
  itemId,
  videoRef,
  streamRef,
  loadToken,
  assLayerRef,
  pgsLayerRef,
  subtitleDelay,
  inPip,
  airPlay,
}: {
  itemId: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  streamRef: RefObject<ActiveStream | null>;
  /** Counts loads of a stream: a subtitle fetched for an older one is dropped. */
  loadToken: RefObject<number>;
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
}) {
  const api = useApi();
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
  /** How the selected subtitle track is drawn: 'text' by SubtitleOverlay, 'ass' and 'pgs' on a canvas. */
  const [subtitleKind, setSubtitleKind] = useState<SubtitleKind>('none');

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
    [api, itemId, clearSubtitles, plainStyled, videoRef, streamRef, loadToken, assLayerRef, pgsLayerRef, subtitleDelayRef],
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
    [attachSubtitle, loadToken],
  );

  /** Has the browser draw the text track itself (true), or leaves that to SubtitleOverlay (false). */
  const showNativeSubtitles = useCallback((show: boolean) => {
    const track = subtitleTrackRef.current?.track;
    // oxlint-disable-next-line react/immutability -- the browser's text track, not React state
    if (track) track.mode = show ? 'showing' : 'hidden';
  }, []);

  /** Whether subtitles of a format can be drawn here, as far as this playback has found out. */
  const drawable = useCallback((format: CanvasFormat) => !undrawable.current.has(format), []);
  // Subtitles drawn on a canvas (styled and image subtitles) take the delay themselves. The kind
  // is listed so that a track attached later gets the delay too.
  useEffect(() => {
    canvasSubtitlesRef.current?.setDelay(subtitleDelay);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [subtitleDelay, subtitleKind]);

  return { subtitleKind, subtitleTrackRef, drawable, subtitleModeOf, clearSubtitles, showSubtitle, showNativeSubtitles };
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
