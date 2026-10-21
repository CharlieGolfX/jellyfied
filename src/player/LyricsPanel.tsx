import clsx from 'clsx';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { LyricLine } from '@/api/types';
import { ticksToSeconds } from '@/lib/format';
import { currentLine, isTimed } from './lyrics';
import { t } from '@/i18n';

/**
 * The words of the playing song. Timed lyrics follow the music: the line being sung is lit and
 * kept in view, and clicking a line jumps there. Plain lyrics are just text.
 */
export function LyricsPanel({
  lines,
  currentTime,
  onSeek,
  onClose,
}: {
  lines: LyricLine[];
  currentTime: number;
  onSeek: (seconds: number) => void;
  onClose: () => void;
}) {
  const timed = isTimed(lines);
  const active = timed ? currentLine(lines, currentTime) : -1;
  const listRef = useRef<HTMLDivElement>(null);
  /** When the listener last scrolled by hand: following the song waits a few seconds after that. */
  const touched = useRef(0);

  useEffect(() => {
    if (active < 0 || performance.now() - touched.current < 4000) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-line="${active}"]`);
    row?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [active]);

  const markTouched = () => {
    touched.current = performance.now();
  };

  return (
    <div
      className="animate-pop-in absolute right-2 bottom-full mb-2 flex max-h-[60vh] w-96 max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-lg bg-base-750 shadow-2xl ring-1 ring-black/40"
      data-testid="lyrics"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="font-semibold">{t('player.audioBar.lyrics')}</span>
        <button onClick={onClose} className="rounded p-1.5 text-muted hover:bg-white/10 hover:text-fg" aria-label={t('common.close')}>
          <X size={16} />
        </button>
      </div>
      <div ref={listRef} className="overflow-y-auto px-4 py-3" onWheel={markTouched} onTouchMove={markTouched}>
        {lines.map((line, i) =>
          timed && typeof line.Start === 'number' ? (
            <button
              key={i}
              data-line={i}
              onClick={() => onSeek(ticksToSeconds(line.Start))}
              aria-current={i === active ? 'true' : undefined}
              className={clsx(
                'block w-full py-1 text-left text-base leading-snug transition-colors',
                i === active ? 'font-semibold text-fg' : i < active ? 'text-faint hover:text-muted' : 'text-muted hover:text-fg',
              )}
            >
              {line.Text || '♪'}
            </button>
          ) : (
            <p key={i} data-line={i} className="min-h-4 py-0.5 text-sm leading-relaxed whitespace-pre-wrap text-muted">
              {line.Text}
            </p>
          ),
        )}
      </div>
    </div>
  );
}
