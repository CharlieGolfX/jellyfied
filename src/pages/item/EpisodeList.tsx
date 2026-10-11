import clsx from 'clsx';
import { CheckCircle, Circle, MoreHorizontal, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cardImage, imageSrc } from '@/api/images';
import { useSetPlayed } from '@/api/queries';
import type { BaseItemDto } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { Img } from '@/components/ui/States';
import { Menu } from '@/components/ui/Menu';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatRuntime, playedPercent } from '@/lib/format';
import { fallbackIcon } from '@/components/media/PosterCard';
import { usePlay } from '@/player/usePlay';

export function EpisodeRow({ episode, onPlay }: { episode: BaseItemDto; onPlay: () => void }) {
  const api = useApi();
  const play = usePlay();
  const toast = useToast();
  const setPlayed = useSetPlayed();
  const src = imageSrc(api, cardImage(episode, 'landscape'), 480);
  const played = Boolean(episode.UserData?.Played);
  const pct = played ? 0 : playedPercent(episode);
  const missing = episode.LocationType === 'Virtual';

  return (
    <div className={clsx('group flex gap-4 rounded-lg p-2 transition-colors hover:bg-white/5 sm:gap-6', missing && 'opacity-50')}>
      <button
        onClick={onPlay}
        disabled={missing}
        className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-md bg-base-800 ring-white/0 transition group-hover:ring-2 group-hover:ring-accent sm:w-60"
        aria-label={`Play ${episode.Name}`}
      >
        <Img
          src={src}
          className="absolute inset-0 h-full w-full object-cover"
          fallback={<div className="absolute inset-0 flex items-center justify-center text-faint">{fallbackIcon(episode, 32)}</div>}
        />
        {!missing && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-ink">
              <Play size={20} fill="currentColor" className="ml-0.5" />
            </span>
          </span>
        )}
        {!played && pct === 0 && !missing && (
          <span className="absolute top-0 right-0 h-0 w-0 border-t-[18px] border-l-[18px] border-t-accent border-l-transparent" />
        )}
        {pct > 0 && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-black/60">
            <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
          </span>
        )}
      </button>
      <div className="min-w-0 flex-1 py-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link to={`/item/${episode.Id}`} className="block truncate font-semibold hover:underline">
              {episode.IndexNumber !== undefined && episode.IndexNumber !== null && (
                <span className="text-muted">{episode.IndexNumber}. </span>
              )}
              {episode.Name}
            </Link>
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted">
              {episode.PremiereDate && <span>{formatDate(episode.PremiereDate)}</span>}
              {episode.RunTimeTicks ? <span>{formatRuntime(episode.RunTimeTicks)}</span> : null}
              {missing && <span className="text-accent">Missing</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
            <button
              onClick={() => setPlayed.mutate({ id: episode.Id, played: !played }, { onError: (e) => toast.error(e) })}
              className="rounded-full p-1.5 hover:bg-white/10"
              title={played ? 'Mark as unwatched' : 'Mark as watched'}
              aria-label={played ? 'Mark as unwatched' : 'Mark as watched'}
            >
              {played ? <CheckCircle size={18} className="text-accent" /> : <Circle size={18} className="text-muted" />}
            </button>
            <Menu
              items={[
                { label: 'Play', icon: <Play size={16} />, onSelect: onPlay },
                ...(pct > 0 ? [{ label: 'Play from beginning', onSelect: () => play(episode, { fromStart: true }) }] : []),
                {
                  label: played ? 'Mark as unwatched' : 'Mark as watched',
                  onSelect: () => setPlayed.mutate({ id: episode.Id, played: !played }, { onError: (e) => toast.error(e) }),
                },
              ]}
              trigger={({ toggle, open }) => (
                <button
                  onClick={toggle}
                  aria-expanded={open}
                  className="rounded-full p-1.5 text-muted hover:bg-white/10 hover:text-fg"
                  aria-label="More"
                >
                  <MoreHorizontal size={18} />
                </button>
              )}
            />
          </div>
        </div>
        {episode.Overview && <p className="mt-2 line-clamp-2 text-sm text-fg/75 sm:line-clamp-3">{episode.Overview}</p>}
      </div>
    </div>
  );
}
