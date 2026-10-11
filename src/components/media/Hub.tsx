import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { CardShape } from '@/api/images';
import { defaultShape } from '@/api/images';
import type { BaseItemDto } from '@/api/types';
import { PosterCard, type PosterCardProps } from './PosterCard';

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

/** A titled horizontal scroller with Plex-style paging arrows. */
export function HubRow({ title, to, actions, children, className }: HubRowProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
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

  const page = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
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
            aria-label="Scroll left"
            className="rounded-full p-1 text-muted transition hover:bg-white/10 hover:text-fg disabled:opacity-25"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            onClick={() => page(1)}
            disabled={!canRight}
            aria-label="Scroll right"
            className="rounded-full p-1 text-muted transition hover:bg-white/10 hover:text-fg disabled:opacity-25"
          >
            <ChevronRight size={22} />
          </button>
        </div>
      </div>
      <div
        ref={scrollerRef}
        onScroll={update}
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

export function Hub({ items, shape, loading, cardProps, hideEmpty = true, ...row }: HubProps) {
  if (!loading && (!items || items.length === 0) && hideEmpty) return null;
  const s = shape ?? (items?.[0] ? defaultShape(items[0]) : 'poster');
  return (
    <HubRow {...row}>
      {loading && !items
        ? Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} shape={s} />)
        : items?.map((item) => (
            <PosterCard key={item.Id} item={item} shape={s} className="shrink-0" style={hubCardStyle(s)} {...cardProps} />
          ))}
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
