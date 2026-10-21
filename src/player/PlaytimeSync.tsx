import { useEffect } from 'react';
import { useApi, useSession } from '@/auth/AuthProvider';
import { syncPlaytime } from '@/lib/playtime';
import { shareDaily } from '@/lib/statsCompare';
import { usePickerSupported } from './syncplayPickerApi';

const EVERY = 2 * 60_000;

/**
 * Saves the time played in this browser to the account every few minutes, and when the tab is put
 * away. For those who compare their stats with others, it also shares their summary once a day.
 */
export function PlaytimeSync() {
  const api = useApi();
  const { userId } = useSession();
  // Comparisons live in the container, which only answers for the server it proxies.
  const canCompare = usePickerSupported();
  useEffect(() => {
    const sync = () =>
      void syncPlaytime(api, userId)
        .then(() => (canCompare ? shareDaily(api, userId) : undefined))
        .catch(() => {});
    const onHidden = () => document.visibilityState === 'hidden' && sync();
    sync();
    const timer = window.setInterval(sync, EVERY);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [api, userId, canCompare]);
  return null;
}
