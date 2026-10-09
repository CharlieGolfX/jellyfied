import clsx from 'clsx';
import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { formatClock } from '@/lib/format';

interface SeekBarProps {
  current: number;
  duration: number;
  buffered?: number;
  onSeek: (seconds: number) => void;
  className?: string;
  compact?: boolean;
  /** Markers such as chapter starts, in seconds. */
  markers?: number[];
  renderPreview?: (seconds: number) => ReactNode;
}

export function SeekBar({ current, duration, buffered, onSeek, className, compact, markers, renderPreview }: SeekBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);

  const valid = duration > 0 && Number.isFinite(duration);
  const fromEvent = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * duration;
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!valid) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag(fromEvent(e.clientX));
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!valid) return;
    const t = fromEvent(e.clientX);
    setHover(t);
    if (drag !== null) setDrag(t);
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    if (drag === null) return;
    onSeek(fromEvent(e.clientX));
    setDrag(null);
  };

  const shown = drag ?? current;
  const pct = valid ? (shown / duration) * 100 : 0;
  const bufPct = valid && buffered ? (buffered / duration) * 100 : 0;
  const hoverPct = valid && hover !== null ? (hover / duration) * 100 : null;

  return (
    <div
      className={clsx('group/seek relative flex cursor-pointer touch-none items-center', compact ? 'h-3' : 'h-5', className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setHover(null)}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(shown)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onSeek(Math.max(0, current - 10));
        if (e.key === 'ArrowRight') onSeek(Math.min(duration, current + 10));
      }}
    >
      <div
        ref={trackRef}
        className={clsx(
          'relative w-full overflow-visible rounded-full bg-white/20 transition-[height]',
          compact ? 'h-1 group-hover/seek:h-1.5' : 'h-1 group-hover/seek:h-1.5',
        )}
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-white/25" style={{ width: `${bufPct}%` }} />
        {hoverPct !== null && (
          <div className="absolute inset-y-0 left-0 rounded-full bg-white/20" style={{ width: `${hoverPct}%` }} />
        )}
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${pct}%` }} />
        {markers?.map((m, i) =>
          valid && m > 0 ? (
            <span key={i} className="absolute inset-y-0 w-0.5 bg-black/60" style={{ left: `${(m / duration) * 100}%` }} />
          ) : null,
        )}
        <div
          className={clsx(
            'absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow transition-opacity',
            drag !== null ? 'opacity-100' : 'opacity-0 group-hover/seek:opacity-100',
          )}
          style={{ left: `${pct}%` }}
        />
      </div>
      {hover !== null && valid && !compact && (
        <div
          className="pointer-events-none absolute bottom-6 -translate-x-1/2 rounded bg-black/85 px-2 py-1 text-xs font-medium text-white tabular-nums"
          style={{ left: `${hoverPct}%` }}
        >
          {renderPreview?.(drag ?? hover)}
          {formatClock(drag ?? hover)}
        </div>
      )}
    </div>
  );
}
