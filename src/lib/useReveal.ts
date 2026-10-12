import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Shows a long list a part at a time: `shown` items at first, and more whenever the end of what
 * is shown comes near the visible area. For lists that are loaded in full but too long to put in
 * the page at once, and whose rows are not equally high (so they can't be windowed by position).
 *
 * Put `endRef` on an element after the last shown item, while `shown < total`.
 * `scroller` is a CSS selector for the scrolling ancestor of that element.
 */
export function useReveal(
  total: number,
  step: number,
  scroller: string,
  margin: string,
): { shown: number; endRef: RefObject<HTMLDivElement | null> } {
  const [count, setCount] = useState(step);
  const endRef = useRef<HTMLDivElement>(null);
  const shown = Math.min(count, total);

  useEffect(() => {
    const end = endRef.current;
    if (!end || shown >= total) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setCount((c) => Math.min(total, Math.max(c, shown) + step));
      },
      { root: end.closest(scroller), rootMargin: margin },
    );
    observer.observe(end);
    return () => observer.disconnect();
  }, [shown, total, step, scroller, margin]);

  return { shown, endRef };
}
