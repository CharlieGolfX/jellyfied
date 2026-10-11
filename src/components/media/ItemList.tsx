import clsx from 'clsx';
import { Check, CheckCircle, MoreHorizontal, Play, Star } from 'lucide-react';
import { memo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { cardImage, defaultShape, imageSrc } from '@/api/images';
import type { BaseItemDto } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { Menu } from '@/components/ui/Menu';
import { Spinner } from '@/components/ui/Spinner';
import { Img } from '@/components/ui/States';
import { formatDate, formatRuntime } from '@/lib/format';
import { defaultTitles, fallbackIcon, itemLink } from './PosterCard';
import { useIsSelected, useSelection, useSelectionCount } from './selection';
import { useItemActions } from './useItemActions';
import { useLatest } from '@/lib/useLatest';
import { useRowWindow } from '@/lib/useRowWindow';
import { t } from '@/i18n';

const ItemRow = memo(function ItemRow({ item, collectionId }: { item: BaseItemDto; collectionId?: string }) {
  const api = useApi();
  const { menuItems, dialogs, play, togglePlayed, played, pct, unplayedCount, watchable, playable } = useItemActions(item, collectionId);
  const selection = useSelection();
  const selected = useIsSelected(item.Id);
  const selecting = useSelectionCount() > 0;
  const shape = defaultShape(item);
  const { title, subtitle } = defaultTitles(item);
  const year = item.ProductionYear ? String(item.ProductionYear) : '';
  // The subtitle of films and shows is their year, which has its own column.
  const detail = subtitle === year ? '' : subtitle;

  return (
    <li
      className={clsx(
        'group/row flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors',
        selected ? 'bg-accent/15' : 'hover:bg-white/5',
      )}
    >
      {selection && (
        <button
          onClick={(e) => selection.toggle(item, e.shiftKey)}
          onMouseDown={(e) => e.shiftKey && e.preventDefault()}
          role="checkbox"
          aria-checked={selected}
          aria-label={t('media.itemList.select', { title })}
          className={clsx(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-opacity',
            selected ? 'border-accent bg-accent text-accent-ink' : 'border-white/40 text-transparent hover:border-white/80',
            selected || selecting ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100',
          )}
        >
          <Check size={12} strokeWidth={3} />
        </button>
      )}
      <Link
        to={itemLink(item)}
        tabIndex={-1}
        aria-hidden
        className={clsx(
          'relative flex h-14 shrink-0 items-center justify-center overflow-hidden rounded bg-base-800 text-faint',
          shape === 'poster' ? 'w-[38px]' : shape === 'square' ? 'w-14' : 'w-24',
        )}
      >
        <Img
          src={imageSrc(api, cardImage(item, shape), 200)}
          className="absolute inset-0 h-full w-full object-cover"
          fallback={fallbackIcon(item, 20)}
        />
        {pct > 0 && (
          <span className="absolute inset-x-0 bottom-0 h-0.5 bg-black/60">
            <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
          </span>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <Link to={itemLink(item)} className="block truncate font-medium text-fg hover:underline" title={title}>
          {title}
        </Link>
        {detail && <div className="truncate text-xs text-muted">{detail}</div>}
      </div>
      <span className="hidden w-12 shrink-0 text-right text-muted tabular-nums sm:block">{year}</span>
      <span className="hidden w-20 shrink-0 text-right text-muted tabular-nums md:block">
        {item.IsFolder ? (item.ChildCount ? `${item.ChildCount} items` : '') : formatRuntime(item.RunTimeTicks)}
      </span>
      <span className="hidden w-14 shrink-0 items-center justify-end gap-1 text-muted tabular-nums lg:flex">
        {item.CommunityRating ? (
          <>
            <Star size={12} className="text-star" fill="currentColor" />
            {item.CommunityRating.toFixed(1)}
          </>
        ) : null}
      </span>
      <span className="hidden w-28 shrink-0 text-right text-xs text-faint xl:block">{formatDate(item.DateCreated)}</span>
      <span className="flex w-8 shrink-0 justify-center">
        {watchable ? (
          <button
            onClick={togglePlayed}
            className={clsx('rounded-full p-1 hover:bg-white/10', played ? 'text-accent' : 'text-white/25 hover:text-white')}
            aria-label={played ? t('common.markAsUnwatched') : t('common.markAsWatched')}
            title={played ? t('common.markAsUnwatched') : t('common.markAsWatched')}
          >
            {unplayedCount > 0 && !played ? (
              <span className="block min-w-5 rounded bg-accent px-1 text-center text-[11px] font-bold text-accent-ink">
                {unplayedCount}
              </span>
            ) : (
              <CheckCircle size={18} />
            )}
          </button>
        ) : null}
      </span>
      <span className="flex w-16 shrink-0 justify-end gap-0.5">
        {playable && (
          <button
            onClick={() => play(item)}
            className="rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-accent"
            aria-label={t('media.itemList.play', { title })}
          >
            <Play size={16} fill="currentColor" />
          </button>
        )}
        {menuItems.length > 0 && (
          <Menu
            items={menuItems}
            trigger={({ open, toggle }) => (
              <button
                onClick={toggle}
                aria-expanded={open}
                aria-label={t('media.itemList.moreActions')}
                className="rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
              >
                <MoreHorizontal size={16} />
              </button>
            )}
          />
        )}
      </span>
      {dialogs}
    </li>
  );
});

/** Dense rows as an alternative to the card grid: more items on screen, with their details in columns. */
export function ItemList({
  items,
  loading,
  hasMore,
  loadingMore,
  onLoadMore,
  collectionId,
}: {
  items: BaseItemDto[];
  loading?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  collectionId?: string;
}) {
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

  const listRef = useRef<HTMLUListElement>(null);
  const rows = useRowWindow(listRef, loading ? 0 : items.length);

  if (loading) {
    return (
      <div className="space-y-1">
        {Array.from({ length: 14 }, (_, i) => (
          <div key={i} className="h-[68px] animate-pulse rounded-md bg-base-800/60" />
        ))}
      </div>
    );
  }

  return (
    <>
      <ul ref={listRef} data-testid="item-list" style={{ paddingTop: rows.padTop, paddingBottom: rows.padBottom }}>
        {items.slice(rows.from, rows.to).map((item) => (
          <ItemRow key={item.Id} item={item} collectionId={collectionId} />
        ))}
      </ul>
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-10 text-accent">
          {loadingMore && <Spinner size={28} />}
        </div>
      )}
    </>
  );
}
