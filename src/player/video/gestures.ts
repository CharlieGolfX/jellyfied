/** Part of the player a tap landed in: the outer thirds skip, the middle doesn't. */
export type TapZone = 'left' | 'center' | 'right';

export function tapZone(x: number, width: number): TapZone {
  if (width <= 0) return 'center';
  const f = x / width;
  return f < 0.35 ? 'left' : f > 0.65 ? 'right' : 'center';
}

/** Two taps this close together in time (ms) and place count as a double tap. */
export const DOUBLE_TAP_MS = 300;
/** A finger that moved less than this (px) tapped; one that moved further sideways is swiping. */
export const TAP_SLOP = 12;
export const SWIPE_START = 24;

/**
 * How far a horizontal swipe seeks. A swipe across the whole player covers a tenth of the video,
 * but never less than a minute or more than five, so it stays precise on films and useful on clips.
 */
export function swipeSeconds(dx: number, width: number, duration: number): number {
  if (width <= 0 || !Number.isFinite(duration) || duration <= 0) return 0;
  const span = Math.min(duration, Math.min(300, Math.max(60, duration / 10)));
  return (dx / width) * span;
}

/** "+0:45" / "−1:10" for the on-screen note while swiping. */
export function formatSeekDelta(seconds: number): string {
  const s = Math.round(Math.abs(seconds));
  return `${seconds < 0 ? '−' : '+'}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
