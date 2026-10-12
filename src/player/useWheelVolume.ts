import { useEffect, useState } from 'react';
import { useLatest } from '@/lib/useLatest';

/** How much one notch of a mouse wheel changes the volume. */
const STEP = 0.05;

/**
 * The volume after the wheel was turned over the volume control. Up is louder. One notch of a
 * mouse wheel is a step; a trackpad sends many small movements, which add up to the same.
 */
export function wheelVolume(volume: number, deltaY: number, deltaMode = 0): number {
  // Wheels report pixels (about 100 a notch) or, in some browsers, lines (about 3 a notch).
  const notches = deltaMode === 1 ? deltaY / 3 : deltaY / 100;
  const change = Math.max(-2, Math.min(2, -notches)) * STEP;
  return Math.round(Math.max(0, Math.min(1, volume + change)) * 100) / 100;
}

/**
 * Turning the wheel over an element changes the volume, instead of scrolling what is behind it.
 * Returns what to pass as that element's `ref`.
 */
export function useWheelVolume(volume: number, onChange: (volume: number) => void): (element: HTMLElement | null) => void {
  // Kept as state, so the listener follows an element that only appears later.
  const [element, setElement] = useState<HTMLElement | null>(null);
  const latest = useLatest({ volume, onChange });
  useEffect(() => {
    if (!element) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      const next = wheelVolume(latest.current.volume, e.deltaY, e.deltaMode);
      if (next !== latest.current.volume) latest.current.onChange(next);
    };
    // Not through React: its wheel listeners can't stop the page from scrolling.
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [element, latest]);
  return setElement;
}
