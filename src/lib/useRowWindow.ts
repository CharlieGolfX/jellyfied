import { useCallback, useLayoutEffect, useState, type RefObject } from 'react';
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

  /** The window for where the page is scrolled to now, or null while the rows can't be measured. */
  const compute = useCallback((): RowWindow | null => {
    const el = ref.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first || count === 0) return { from: 0, to: Math.min(count, FIRST), padTop: 0, padBottom: 0 };
    const style = getComputedStyle(el);
    const columns = style.display.includes('grid') ? Math.max(1, style.gridTemplateColumns.split(' ').length) : 1;
    const pitch = first.offsetHeight + (parseFloat(style.rowGap) || 0);
    if (pitch <= 0) return null;
    const scroller = el.closest<HTMLElement>('#main-scroll') ?? document.documentElement;
    const view = scroller.getBoundingClientRect();
    // Where the visible area starts and ends, measured from the top of the element.
    const top = view.top - el.getBoundingClientRect().top;
    return rowsInView(count, columns, pitch, top - OVERSCAN, top + scroller.clientHeight + OVERSCAN);
  }, [ref, count]);

  useLayoutEffect(() => {
    const same = (a: RowWindow, b: RowWindow) => a.from === b.from && a.to === b.to && a.padTop === b.padTop && a.padBottom === b.padBottom;
    const first = compute();
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
      if (!next || (current && same(current, next))) return;
      current = next;
      flushSync(() => setWin(next));
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
