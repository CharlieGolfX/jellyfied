import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { JellyfinApi } from '@/api/client';
import type { BaseItemDto, MediaSegment } from '@/api/types';
import { ticksToSeconds } from '@/lib/format';
import { pickTrickplay, pipSupported, SEGMENT_LABELS, SKIP_BUTTON_SECONDS, TRICKPLAY_PREVIEW_WIDTH } from './shared';

/**
 * The parts of the video player around the video itself: on-screen notes, sizes, picture-in-picture,
 * full screen, controls that hide themselves, the skip button and the seek-bar thumbnails.
 */

/** Short on-screen note for changes made with the keyboard or by touch. */
export function useOsd() {
  const [osd, setOsd] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const flash = useCallback((text: string) => {
    setOsd(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOsd(null), 1500);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { osd, flash };
}

/** Size of the player and of the video itself, for the aspect ratio and zoom modes. */
export function usePlayerSizes(containerRef: RefObject<HTMLElement | null>, videoRef: RefObject<HTMLVideoElement | null>) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [video, setVideo] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = containerRef.current;
    const v = videoRef.current;
    if (!el || !v) return;
    const observer = new ResizeObserver(() => setBox({ width: el.clientWidth, height: el.clientHeight }));
    observer.observe(el);
    const onSize = () => setVideo({ width: v.videoWidth, height: v.videoHeight });
    v.addEventListener('loadedmetadata', onSize);
    v.addEventListener('resize', onSize);
    return () => {
      observer.disconnect();
      v.removeEventListener('loadedmetadata', onSize);
      v.removeEventListener('resize', onSize);
    };
  }, [containerRef, videoRef]);
  return { box, video };
}

/** Picture-in-picture: whether it is on (the browser can also open and close it by itself), and a toggle. */
export function usePictureInPicture(videoRef: RefObject<HTMLVideoElement | null>) {
  const [inPip, setInPip] = useState(false);
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
  }, [videoRef]);

  const togglePip = useCallback(() => {
    const video = videoRef.current;
    if (!video || !pipSupported) return;
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => {});
    else void video.requestPictureInPicture().catch(() => {});
  }, [videoRef]);

  return { inPip, togglePip };
}

/** Browser full screen for the player (or for the video alone on iPhone, which allows nothing else). */
export function useFullscreen(containerRef: RefObject<HTMLElement | null>, videoRef: RefObject<HTMLVideoElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);
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
  }, [containerRef, videoRef]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  return { isFullscreen, toggleFullscreen };
}

/** Controls that go away after three seconds without the mouse, a key or a touch. */
export function useAutoHide() {
  const [visible, setVisible] = useState(true);
  const timer = useRef<number | undefined>(undefined);
  const countDown = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVisible(false), 3000);
  }, []);
  /** Shows the controls and starts the countdown again. */
  const poke = useCallback(() => {
    setVisible(true);
    countDown();
  }, [countDown]);
  // Start the countdown right away, so the controls also go away when the mouse is never moved
  // (e.g. when the next episode starts by itself).
  useEffect(() => {
    countDown();
    return () => window.clearTimeout(timer.current);
  }, [countDown]);
  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setVisible(false);
  }, []);
  return { visible, poke, hide };
}

/**
 * The intro, recap or credits the video is in right now, if any. `fresh` is true for the first few
 * seconds of it: the skip button shows by itself then, and afterwards only with the controls.
 */
export function useActiveSegment(segments: MediaSegment[] | undefined, currentTime: number) {
  const segment = useMemo(
    () =>
      (segments ?? []).find((s) => {
        const from = ticksToSeconds(s.StartTicks);
        const to = ticksToSeconds(s.EndTicks);
        return SEGMENT_LABELS[s.Type] && currentTime >= from && currentTime < to - 1;
      }),
    [segments, currentTime],
  );
  const key = segment ? `${segment.Type}-${segment.StartTicks}` : null;
  // The segment whose few seconds are over. Forgotten once the video is out of it, so the
  // button shows by itself again when the same segment comes round another time.
  const [stale, setStale] = useState<string | null>(null);
  if (!key && stale) setStale(null);
  useEffect(() => {
    if (!key) return;
    const timer = window.setTimeout(() => setStale(key), SKIP_BUTTON_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [key]);
  return { segment, fresh: key !== null && stale !== key };
}

/** Thumbnail shown above the seek bar, cut out of the server's trickplay sheets. Undefined when the video has none. */
export function useTrickplayPreview(
  api: JellyfinApi,
  item: BaseItemDto | undefined,
  itemId: string,
  sourceId: string | undefined,
): ((seconds: number) => ReactNode) | undefined {
  const trickplay = useMemo(() => pickTrickplay(item, sourceId), [item, sourceId]);
  const render = useCallback(
    (seconds: number) => {
      if (!trickplay || !sourceId) return null;
      const perTile = trickplay.TileWidth * trickplay.TileHeight;
      const n = Math.min(trickplay.ThumbnailCount - 1, Math.max(0, Math.floor((seconds * 1000) / trickplay.Interval)));
      const sheet = Math.floor(n / perTile);
      const cell = n % perTile;
      const scale = TRICKPLAY_PREVIEW_WIDTH / trickplay.Width;
      const w = trickplay.Width * scale;
      const h = trickplay.Height * scale;
      const url = api.url(`/Videos/${itemId}/Trickplay/${trickplay.Width}/${sheet}.jpg`, { mediaSourceId: sourceId }, true);
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
    [api, itemId, trickplay, sourceId],
  );
  return trickplay ? render : undefined;
}
