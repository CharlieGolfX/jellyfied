import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { CardShape } from '@/api/images';
import { defaultShape } from '@/api/images';
import type { BaseItemDto } from '@/api/types';
import { PosterCard, type PosterCardProps } from './PosterCard';
import { t } from '@/i18n';
import { useReveal } from '@/lib/useReveal';

/** Card width in hub rows: responsive base size scaled by the global poster-size setting. */
export function hubCardStyle(shape: CardShape): CSSProperties {
  return { width: `calc(var(--hub-${shape}) * var(--card-scale))` };
}

interface HubRowProps {
  title: ReactNode;
  to?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** How far each row was scrolled sideways, by the history entry it was on and the row's title. */
const rowPositions = new Map<string, number>();
/** A page has a few rows: this keeps those of the last hundred or so pages, not every one ever seen. */
const KEPT_ROWS = 400;

function keepRowPosition(key: string, left: number) {
  // Newest last, so the oldest is the first to go.
  rowPositions.delete(key);
  rowPositions.set(key, left);
  if (rowPositions.size > KEPT_ROWS) rowPositions.delete(rowPositions.keys().next().value!);
}

/** A titled horizontal scroller with paging arrows. */
export function HubRow({ title, to, actions, children, className }: HubRowProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  // Going back to a page puts its rows where they were scrolled to, like the page itself (see AppShell).
  const location = useLocation();
  const id = useId();
  const memoryKey = `${location.key}:${typeof title === 'string' ? title : id}`;
  const memoryKeyRef = useRef(memoryKey);
  // A filter or tab gives the page a new history entry; leaving it gives the next page's, which this
  // row, about to go away, must not save its place under.
  const [path] = useState(location.pathname);
  const samePage = location.pathname === path;
  useEffect(() => {
    if (samePage) memoryKeyRef.current = memoryKey;
  }, [samePage, memoryKey]);
  // The cards may not all be there yet: keep going there as the row grows, until the user scrolls it.
  const restoring = useRef(rowPositions.get(memoryKey) ?? 0);
  const stopRestoring = () => {
    restoring.current = 0;
  };

  const update = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (restoring.current > 0) {
      // Not smoothly, as the row's own scrolling is.
      el.scrollTo({ left: restoring.current, behavior: 'instant' });
      if (Math.abs(el.scrollLeft - restoring.current) < 2) restoring.current = 0;
    } else {
      keepRowPosition(memoryKeyRef.current, el.scrollLeft);
    }
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
    // Other cards mean another width, so measure again when the children change.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [update, children]);

  // Also remember the place when the row goes away, while it is still on the page: a scroll right
  // before a click that leaves the page may only report itself once the page has changed (WebKit).
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    return () => {
      if (el && restoring.current === 0) keepRowPosition(memoryKeyRef.current, el.scrollLeft);
    };
  }, []);

  const page = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    stopRestoring();
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
  };

  return (
    <section className={clsx('group/hub relative', className)}>
      <div className="mb-3 flex items-center justify-between gap-4 px-4 sm:px-8 lg:px-10">
        <h2 className="truncate text-lg font-semibold tracking-tight">
          {to ? (
            <Link to={to} className="hover:text-accent">
              {title}
              <ChevronRight size={18} className="ml-0.5 inline-block -translate-y-px text-muted" />
            </Link>
          ) : (
            title
          )}
        </h2>
        <div className="flex items-center gap-1">
          {actions}
          <button
            onClick={() => page(-1)}
            disabled={!canLeft}
            aria-label={t('media.hub.scrollLeft')}
            className="rounded-full p-1 text-muted transition hover:bg-white/10 hover:text-fg disabled:opacity-25"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            onClick={() => page(1)}
            disabled={!canRight}
            aria-label={t('media.hub.scrollRight')}
            className="rounded-full p-1 text-muted transition hover:bg-white/10 hover:text-fg disabled:opacity-25"
          >
            <ChevronRight size={22} />
          </button>
        </div>
      </div>
      <div
        ref={scrollerRef}
        data-hub-scroller
        onScroll={update}
        onWheel={stopRestoring}
        onPointerDown={stopRestoring}
        onTouchStart={stopRestoring}
        // A horizontal scroller also clips vertically, so pad the top to leave room for the cards' hover ring.
        className="scrollbar-none -mt-1 overflow-x-auto scroll-smooth px-4 pt-1 pb-2 sm:px-8 lg:px-10"
        style={{ scrollPaddingInline: '2.5rem' }}
      >
        <div className="flex w-max gap-4 sm:gap-5">{children}</div>
      </div>
    </section>
  );
}

interface HubProps extends Omit<HubRowProps, 'children'> {
  items: BaseItemDto[] | undefined;
  shape?: CardShape;
  loading?: boolean;
  cardProps?: Partial<PosterCardProps>;
  /** Hide entirely when empty (default true). */
  hideEmpty?: boolean;
}

/** How many cards of a row are put in the page at first, and with each step sideways. */
const ROW_STEP = 30;

export function Hub({ items, shape, loading, cardProps, hideEmpty = true, ...row }: HubProps) {
  // A row can hold hundreds of cards (search results); the rest come as it is scrolled sideways.
  const { shown, endRef } = useReveal(items?.length ?? 0, ROW_STEP, '[data-hub-scroller]', '0px 1200px');
  if (!loading && (!items || items.length === 0) && hideEmpty) return null;
  const s = shape ?? (items?.[0] ? defaultShape(items[0]) : 'poster');
  return (
    <HubRow {...row}>
      {loading && !items
        ? Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} shape={s} />)
        : items
            ?.slice(0, shown)
            .map((item) => <PosterCard key={item.Id} item={item} shape={s} className="shrink-0" style={hubCardStyle(s)} {...cardProps} />)}
      {items && shown < items.length && <div ref={endRef} className="w-px shrink-0" data-testid="row-more" />}
    </HubRow>
  );
}

export function SkeletonCard({ shape, className }: { shape: CardShape; className?: string }) {
  const aspect = shape === 'poster' ? 'aspect-[2/3]' : shape === 'landscape' ? 'aspect-video' : 'aspect-square';
  return (
    <div className={clsx('shrink-0', className)} style={className ? undefined : hubCardStyle(shape)}>
      <div className={clsx('animate-pulse rounded-md bg-base-800', aspect)} />
      <div className="mt-2 h-3.5 w-3/4 animate-pulse rounded bg-base-800" />
      <div className="mt-1.5 h-3 w-1/3 animate-pulse rounded bg-base-800" />
    </div>
  );
}
