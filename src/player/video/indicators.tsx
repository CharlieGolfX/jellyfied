import { Moon } from 'lucide-react';
import { formatClock } from '@/lib/format';
import { formatTimeOfDay, useTimeFormat } from '@/lib/timeFormat';
import { useSleepTimer } from '../sleepTimer';
import { useClock } from '@/lib/useClock';

/** Wall-clock time at which playback will finish, taking playback speed into account. */
export function EndsAt({ remaining, speed }: { remaining: number; speed: number }) {
  // The clock keeps the time moving while paused, when nothing else re-renders this.
  const now = useClock(15_000);
  const [timeFormat] = useTimeFormat();
  const end = new Date(now + (remaining / speed) * 1000);
  return <span className="mr-2 hidden text-sm text-white/70 tabular-nums sm:inline">Ends at {formatTimeOfDay(end, timeFormat)}</span>;
}

/** Countdown shown in the controls while a sleep timer is running. */
export function SleepIndicator() {
  const sleep = useSleepTimer();
  const now = useClock(1000);
  if (!sleep.endsAt && !sleep.endOfVideo) return null;
  const left = sleep.endsAt ? Math.max(0, (sleep.endsAt - now) / 1000) : 0;
  return (
    <span
      data-testid="sleep-indicator"
      className="mr-2 flex items-center gap-1 text-sm text-accent tabular-nums"
      title={sleep.endOfVideo ? 'Sleep timer: stops when this video ends' : 'Sleep timer'}
    >
      <Moon size={15} />
      {sleep.endOfVideo ? 'End of video' : formatClock(left)}
    </span>
  );
}
