import { useEffect } from 'react';

/**
 * Keeps the screen on while `active`. Browsers do this by themselves for a video that fills the
 * window, but not reliably for the mini player or once the video is drawn elsewhere. The lock is
 * dropped by the browser whenever the tab is hidden, so it is taken again when the tab comes back.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      navigator.wakeLock
        .request('screen')
        .then((sentinel) => {
          if (cancelled) void sentinel.release().catch(() => {});
          else lock = sentinel;
        })
        .catch(() => {
          /* refused (battery saver, permissions policy): nothing to do */
        });
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', request);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
