import { useEffect } from 'react';
import { useApi, useSession } from '@/auth/AuthProvider';
import { syncPlaytime } from '@/lib/playtime';

const EVERY = 2 * 60_000;

/** Saves the time played in this browser to the account every few minutes, and when the tab is put away. */
export function PlaytimeSync() {
  const api = useApi();
  const { userId } = useSession();
  useEffect(() => {
    const sync = () => void syncPlaytime(api, userId).catch(() => {});
    const onHidden = () => document.visibilityState === 'hidden' && sync();
    sync();
    const timer = window.setInterval(sync, EVERY);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [api, userId]);
  return null;
}
