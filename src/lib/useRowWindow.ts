import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';

export interface RowWindow {
  /** The slice of items to render: [from, to). */
  from: number;
  to: number;
  /** Space that stands in for the rows left out above and below, in pixels. */
  padTop: number;
  padBottom: number;
}

/** How many items are rendered before the rows have been measured. */
const FIRST = 60;
/** How far outside the visible area rows are kept, in pixels. */
const OVERSCAN = 1200;

/** The rows that fall inside [top, bottom] of a list whose rows are `pitch` high, as item positions. */
export function rowsInView(count: number, columns: number, pitch: number, top: number, bottom: number): RowWindow {
  const rows = Math.ceil(count / columns);
  const first = Math.min(Math.max(0, Math.floor(top / pitch)), Math.max(0, rows - 1));
  const last = Math.min(rows, Math.max(first + 1, Math.ceil(bottom / pitch)));
  return { from: first * columns, to: Math.min(count, last * columns), padTop: first * pitch, padBottom: (rows - last) * pitch };
}

/**
 * Keeps only the rows near the visible area mounted in a long grid or list, so a library of
 * thousands of items does not become thousands of cards in the page. The element `ref` points at
 * holds the items as its direct children; the caller renders `items.slice(from, to)` into it and
 * gives it `padTop` and `padBottom` as padding. Rows are taken to be equally high, which the
 * cards and list rows are.
 */
export function useRowWindow(ref: RefObject<HTMLElement | null>, count: number): RowWindow {
  const [win, setWin] = useState<RowWindow>({ from: 0, to: Math.min(count, FIRST), padTop: 0, padBottom: 0 });

  /** How the rows were laid out when they were last measured. */
  const layout = useRef<{
    columns: number;
    pitch: number;
    /** The item that starts the row at the top of the screen, and how far into that row the screen starts (0 to 1). */
    item: number;
    into: number;
    /** Where this hook last put the page itself: arriving there is not the user choosing a new place. */
    placed: number | null;
  } | null>(null);

  /**
   * The window for where the page is scrolled to now, or null while the rows can't be measured.
   * When the rows have changed shape since last time (another poster size, a resized window), the
   * same items would be somewhere else in the list: `shift` is how far to scroll to keep the row
   * that was at the top of the screen there, and the window is the one for that position.
   */
  const compute = useCallback((): { win: RowWindow; shift: number } | null => {
    const el = ref.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first || count === 0) return { win: { from: 0, to: Math.min(count, FIRST), padTop: 0, padBottom: 0 }, shift: 0 };
    const style = getComputedStyle(el);
    const columns = style.display.includes('grid') ? Math.max(1, style.gridTemplateColumns.split(' ').length) : 1;
    const pitch = first.offsetHeight + (parseFloat(style.rowGap) || 0);
    if (pitch <= 0) return null;
    const scroller = el.closest<HTMLElement>('#main-scroll') ?? document.documentElement;
    const view = scroller.getBoundingClientRect();
    // Where the visible area starts and ends, measured from the top of the element.
    let top = view.top - el.getBoundingClientRect().top;
    let shift = 0;
    const before = layout.current;
    const changed = before !== null && (before.columns !== columns || Math.abs(before.pitch - pitch) > 0.5);
    if (changed && (before.item > 0 || before.into > 0)) {
      // Go by the item that was at the top, not by where the page is now: a list that became
      // shorter has already been pulled back to its new end by the browser.
      const target = (Math.floor(before.item / columns) + before.into) * pitch;
      shift = target - top;
      top = target;
      layout.current = { ...before, columns, pitch, placed: target };
    } else if (before && before.placed !== null && Math.abs(before.placed - top) < 2) {
      // The page has arrived where it was put: the item to hold on to stays the same, so that
      // going through several sizes does not drift a row at a time.
      layout.current = { ...before, columns, pitch };
    } else {
      const row = Math.max(0, Math.floor(top / pitch));
      layout.current = { columns, pitch, item: row * columns, into: Math.max(0, top / pitch - row), placed: null };
    }
    return { win: rowsInView(count, columns, pitch, top - OVERSCAN, top + scroller.clientHeight + OVERSCAN), shift };
  }, [ref, count]);

  useLayoutEffect(() => {
    const same = (a: RowWindow, b: RowWindow) => a.from === b.from && a.to === b.to && a.padTop === b.padTop && a.padBottom === b.padBottom;
    const first = compute()?.win ?? null;
    // The window depends on sizes that only exist once the rows are in the page.
    // oxlint-disable-next-line react/set-state-in-effect
    if (first) setWin((w) => (same(w, first) ? w : first));
    const el = ref.current;
    if (!el) return;
    const scroller = el.closest<HTMLElement>('#main-scroll') ?? window;
    let current = first;
    // Scroll events arrive just before the browser paints. The rows are swapped right then, not a
    // moment later, so a jump to somewhere else in the list never shows an empty frame.
    const update = () => {
      const next = compute();
      if (!next) return;
      // Worked out before the rows change: a page that gets shorter is pulled back by the browser first.
      const target = (scroller instanceof Window ? scroller.scrollY : scroller.scrollTop) + next.shift;
      if (!current || !same(current, next.win)) {
        current = next.win;
        flushSync(() => setWin(next.win));
      }
      // After the rows are in: the page is only now as tall as the new layout makes it.
      if (Math.abs(next.shift) > 1) scroller.scrollTo({ top: target });
    };
    scroller.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(() => requestAnimationFrame(update));
    observer.observe(el);
    return () => {
      scroller.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [compute, ref]);

  return win;
}
