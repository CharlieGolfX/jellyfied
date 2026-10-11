import { Maximize2, Pause, PictureInPicture2, Play, X } from 'lucide-react';
import { Link } from 'react-router-dom';

/** Controls drawn over the mini player while it is hovered or focused. */
export function MiniOverlay({
  title,
  subtitle,
  itemId,
  playing,
  progress,
  onToggle,
  onExpand,
  onClose,
  onPip,
}: {
  title: string;
  subtitle: string;
  itemId: string;
  playing: boolean;
  progress: number;
  onToggle: () => void;
  onExpand: () => void;
  onClose: () => void;
  onPip?: () => void;
}) {
  const btn = 'flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20';
  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-black/80 via-black/20 to-black/70 opacity-0 transition-opacity group-hover/mini:opacity-100 group-focus-within/mini:opacity-100" />
      <div className="absolute inset-x-0 top-0 z-20 flex items-start gap-2 p-2 opacity-0 transition-opacity group-hover/mini:opacity-100 group-focus-within/mini:opacity-100">
        <Link to={`/item/${itemId}`} className="min-w-0 flex-1 rounded px-1 hover:bg-white/10" title="Show details">
          <div className="truncate text-sm font-semibold">{title}</div>
          {subtitle && <div className="truncate text-xs text-white/70">{subtitle}</div>}
        </Link>
        {onPip && (
          <button onClick={onPip} className={btn} aria-label="Picture-in-picture" title="Picture-in-picture">
            <PictureInPicture2 size={18} />
          </button>
        )}
        <button onClick={onExpand} className={btn} aria-label="Expand player" title="Expand">
          <Maximize2 size={18} />
        </button>
        <button onClick={onClose} className={btn} aria-label="Stop playback" title="Stop playback">
          <X size={18} />
        </button>
      </div>
      <button
        onClick={onToggle}
        aria-label={playing ? 'Pause' : 'Play'}
        className="absolute top-1/2 left-1/2 z-20 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover/mini:opacity-100 group-focus-within/mini:opacity-100 hover:bg-accent"
      >
        {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="absolute inset-x-0 bottom-0 z-20 h-1 bg-white/20">
        <div className="h-full bg-accent" style={{ width: `${Math.min(100, progress * 100)}%` }} />
      </div>
    </>
  );
}
