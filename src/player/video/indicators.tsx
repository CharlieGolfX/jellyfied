import { Moon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatClock } from '@/lib/format';
import { formatTimeOfDay, useTimeFormat } from '@/lib/timeFormat';
import { useSleepTimer } from '../sleepTimer';

/** Wall-clock time at which playback will finish, taking playback speed into account. */
export function EndsAt({ remaining, speed }: { remaining: number; speed: number }) {
  // Re-render on a timer too, so the time keeps moving while paused.
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const [timeFormat] = useTimeFormat();
  const end = new Date(Date.now() + (remaining / speed) * 1000);
  return (
    <span className="mr-2 hidden text-sm text-white/70 tabular-nums sm:inline">
      Ends at {formatTimeOfDay(end, timeFormat)}
    </span>
  );
}

/** Countdown shown in the controls while a sleep timer is running. */
export function SleepIndicator() {
  const sleep = useSleepTimer();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!sleep.endsAt) return;
    const timer = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [sleep.endsAt]);
  if (!sleep.endsAt && !sleep.endOfVideo) return null;
  const left = sleep.endsAt ? Math.max(0, (sleep.endsAt - Date.now()) / 1000) : 0;
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
