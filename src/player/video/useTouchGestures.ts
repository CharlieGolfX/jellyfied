import { useCallback, useRef, type RefObject, type TouchEvent } from 'react';
import { formatClock } from '@/lib/format';
import { DOUBLE_TAP_MS, formatSeekDelta, SWIPE_START, swipeSeconds, TAP_SLOP, tapZone, type TapZone } from './gestures';

interface GestureOptions {
  /** Off for the mini player, where a tap just opens the player. */
  enabled: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  containerRef: RefObject<HTMLElement | null>;
  /** The controls are showing right now. */
  controlsShown: boolean;
  hideControls: () => void;
  /** A menu is open: a tap only closes it. */
  menuOpen: boolean;
  closeMenu: () => void;
  skip: (delta: number) => void;
  seekTo: (seconds: number) => void;
  toggleFullscreen: () => void;
  flash: (text: string) => void;
  back: number;
  forward: number;
}

/**
 * Touch control of the full-screen player: tap to show or hide the controls, double-tap the left
 * or right side to skip, double-tap the middle for full screen, and swipe sideways to seek.
 */
export function useTouchGestures(opts: GestureOptions) {
  const o = useRef(opts);
  o.current = opts;
  const touch = useRef<{ x: number; y: number; at: number; time: number; controls: boolean; swiping: boolean; target: number } | null>(null);
  const lastTap = useRef<{ at: number; zone: TapZone } | null>(null);
  const lastTouchAt = useRef(0);

  const onTouchStart = useCallback((e: TouchEvent) => {
    const c = o.current;
    if (!c.enabled || e.touches.length !== 1) {
      touch.current = null;
      return;
    }
    const t = e.touches[0];
    const time = c.videoRef.current?.currentTime ?? 0;
    // Remember whether the controls were up before this touch brought them up.
    touch.current = { x: t.clientX, y: t.clientY, at: Date.now(), time, controls: c.controlsShown, swiping: false, target: time };
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    const c = o.current;
    const s = touch.current;
    const video = c.videoRef.current;
    if (!s || !video || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - s.x;
    const dy = e.touches[0].clientY - s.y;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (!s.swiping) {
      if (duration <= 0 || Math.abs(dx) < SWIPE_START || Math.abs(dx) < Math.abs(dy) * 2) return;
      s.swiping = true;
    }
    const width = c.containerRef.current?.clientWidth ?? window.innerWidth;
    s.target = Math.min(Math.max(0, s.time + swipeSeconds(dx, width, duration)), Math.max(0, duration - 1));
    c.flash(`${formatClock(s.target)}  (${formatSeekDelta(s.target - s.time)})`);
  }, []);

  const onTouchEnd = useCallback((e: TouchEvent) => {
    const c = o.current;
    const s = touch.current;
    touch.current = null;
    lastTouchAt.current = Date.now();
    if (!s || !c.enabled) return;
    if (s.swiping) {
      c.seekTo(s.target);
      return;
    }
    const t = e.changedTouches[0];
    if (!t || Math.abs(t.clientX - s.x) > TAP_SLOP || Math.abs(t.clientY - s.y) > TAP_SLOP || Date.now() - s.at > 600) return;
    if (c.menuOpen) {
      c.closeMenu();
      lastTap.current = null;
      return;
    }
    const rect = c.containerRef.current?.getBoundingClientRect();
    const zone = tapZone(t.clientX - (rect?.left ?? 0), rect?.width ?? window.innerWidth);
    const prev = lastTap.current;
    const now = Date.now();
    if (prev && now - prev.at < DOUBLE_TAP_MS && prev.zone === zone) {
      // Further taps keep skipping, so the double tap stays "armed".
      lastTap.current = { at: now, zone };
      if (zone === 'left') {
        c.skip(-c.back);
        c.flash(`−${c.back} s`);
      } else if (zone === 'right') {
        c.skip(c.forward);
        c.flash(`+${c.forward} s`);
      } else {
        lastTap.current = null;
        c.toggleFullscreen();
      }
      return;
    }
    lastTap.current = { at: now, zone };
    // The touch itself already brought the controls up; a tap while they were up puts them away.
    if (s.controls) c.hideControls();
  }, []);

  /** A mouse click is also reported after a touch; the gestures above have dealt with that one. */
  const fromTouch = useCallback(() => Date.now() - lastTouchAt.current < 700, []);

  return { handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd }, fromTouch };
}
