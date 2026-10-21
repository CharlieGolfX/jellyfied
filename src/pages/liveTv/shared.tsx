import { useEffect, useState } from 'react';
import type { BaseItemDto } from '@/api/types';
import { formatTimeOfDay, useTimeFormat } from '@/lib/timeFormat';
import { usePlay } from '@/player/usePlay';

/** How far through its slot a programme is, 0–100, or null when its times are unknown. */
export function programProgress(program: Pick<BaseItemDto, 'StartDate' | 'EndDate'> | null | undefined, now: number): number | null {
  const start = program?.StartDate ? Date.parse(program.StartDate) : NaN;
  const end = program?.EndDate ? Date.parse(program.EndDate) : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
}

/** Re-renders every half minute, so progress bars and "on now" keep moving. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function ProgramTimes({ program }: { program: BaseItemDto }) {
  const [format] = useTimeFormat();
  if (!program.StartDate || !program.EndDate) return null;
  return (
    <span className="tabular-nums">
      {formatTimeOfDay(new Date(program.StartDate), format)} – {formatTimeOfDay(new Date(program.EndDate), format)}
    </span>
  );
}

/** Watching a programme means tuning to its channel. */
export function usePlayChannel() {
  const play = usePlay();
  return (channelId: string, name?: string | null) =>
    play({ Id: channelId, Name: name, Type: 'TvChannel', MediaType: 'Video', IsFolder: false } as BaseItemDto, { fromStart: true });
}
