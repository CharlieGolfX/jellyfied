import clsx from 'clsx';
import { Info, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { backdropSrc, logoSrc } from '@/api/images';
import { useItems } from '@/api/queries';
import { useApi } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Img } from '@/components/ui/States';
import { formatRuntime } from '@/lib/format';
import { usePlay } from '@/player/usePlay';

const ROTATE_MS = 12_000;

/**
 * Large featured title at the top of the home page: the newest films and shows that have artwork
 * and have not been watched yet, shown one at a time.
 */
export function FeaturedBanner() {
  const api = useApi();
  const play = usePlay();
  const { data } = useItems(
    {
      recursive: true,
      includeItemTypes: ['Movie', 'Series'],
      sortBy: 'DateCreated',
      sortOrder: 'Descending',
      filters: 'IsUnplayed',
      imageTypes: 'Backdrop',
      limit: 6,
    },
    { key: ['featured'] },
  );
  const items = data?.Items ?? [];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = items.length;

  useEffect(() => {
    if (count < 2 || paused) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [count, paused]);

  const item = items[Math.min(index, count - 1)];
  if (!item) return null;
  const logo = logoSrc(api, item, 500);
  const facts = [item.ProductionYear, item.OfficialRating, item.Type === 'Movie' ? formatRuntime(item.RunTimeTicks) : null, ...(item.Genres ?? []).slice(0, 2)]
    .filter(Boolean)
    .join(' · ');

  return (
    <section
      aria-label="Featured"
      data-testid="featured-banner"
      className="relative -mt-6 mb-2 h-[min(56vh,520px)] min-h-72 overflow-hidden sm:-mt-8"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Img key={item.Id} src={backdropSrc(api, item, 1920)} className="absolute inset-0 h-full w-full object-cover object-top" />
      <div className="absolute inset-0 bg-gradient-to-r from-base-900 via-base-900/70 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-base-900 via-transparent to-transparent" />
      <div className="absolute inset-x-0 bottom-0 max-w-2xl space-y-3 px-4 pb-8 sm:px-8 lg:px-10">
        {logo ? (
          <Img src={logo} alt={item.Name ?? ''} className="max-h-28 max-w-[min(70vw,420px)] object-contain object-left" fallback={<h2 className="text-3xl font-bold">{item.Name}</h2>} />
        ) : (
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{item.Name}</h2>
        )}
        {facts && <div className="text-sm text-muted">{facts}</div>}
        {item.Overview && <p className="line-clamp-3 text-sm text-fg/85">{item.Overview}</p>}
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <Button variant="primary" icon={<Play size={18} fill="currentColor" />} onClick={() => play(item)}>
            Play
          </Button>
          <Link
            to={`/item/${item.Id}`}
            className="flex h-10 items-center gap-2 rounded-md bg-white/10 px-4 text-sm font-semibold transition-colors hover:bg-white/20"
          >
            <Info size={18} /> Details
          </Link>
          {count > 1 && (
            <div className="ml-2 flex gap-1.5" role="group" aria-label="Featured titles">
              {items.map((it, i) => (
                <button
                  key={it.Id}
                  onClick={() => setIndex(i)}
                  aria-label={it.Name ?? `Title ${i + 1}`}
                  aria-pressed={i === index}
                  className={clsx('h-2 rounded-full transition-all', i === index ? 'w-6 bg-accent' : 'w-2 bg-white/35 hover:bg-white/60')}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
