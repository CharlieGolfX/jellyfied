import { useEffect, useRef, type CSSProperties } from 'react';
import type { CardShape } from '@/api/images';
import type { BaseItemDto } from '@/api/types';
import { Spinner } from '@/components/ui/Spinner';
import { PosterCard, type PosterCardProps } from './PosterCard';
import { SkeletonCard } from './Hub';
import { useLatest } from '@/lib/useLatest';

interface CardGridProps {
  items: BaseItemDto[];
  shape: CardShape;
  /** Base minimum card width in px (before the poster-size setting); columns are fitted automatically. */
  minWidth?: number;
  loading?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  cardProps?: Partial<PosterCardProps>;
}

export function CardGrid({ items, shape, minWidth, loading, hasMore, loadingMore, onLoadMore, cardProps }: CardGridProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useLatest(onLoadMore);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMoreRef.current?.();
      },
      { rootMargin: '800px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
    // Observing again after more items arrived makes the next page load when the end is still in view.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [hasMore, items.length, loadMoreRef]);

  const width = minWidth ?? (shape === 'landscape' ? 260 : shape === 'square' ? 160 : 150);
  const style = {
    gridTemplateColumns: `repeat(auto-fill, minmax(min(calc(${width}px * var(--card-scale)), 42vw), 1fr))`,
  } as CSSProperties;

  return (
    <>
      <div className="grid gap-x-5 gap-y-6" style={style}>
        {loading
          ? Array.from({ length: 24 }, (_, i) => <SkeletonCard key={i} shape={shape} className="w-full" />)
          : items.map((item) => <PosterCard key={item.Id} item={item} shape={shape} {...cardProps} />)}
      </div>
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-10 text-accent">
          {loadingMore && <Spinner size={28} />}
        </div>
      )}
    </>
  );
}
