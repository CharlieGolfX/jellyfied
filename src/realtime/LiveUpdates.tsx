import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MEDIA } from '@/api/queries';
import { getActiveVideo } from '@/player/activePlayer';
import { useSocket } from './RealtimeProvider';

/** Changes are collected for this long before the lists are fetched again. */
export const REFRESH_DELAY = 1500;
/**
 * While something is playing here, this browser's own progress reports come back as "user data
 * changed" every few seconds. The lists are then only refreshed this often.
 */
export const PLAYING_REFRESH_DELAY = 60_000;

/** How long to wait before refreshing, given how long ago the last refresh was. */
export function refreshDelay(playing: boolean, sinceLast: number): number {
  if (!playing) return REFRESH_DELAY;
  return Math.max(REFRESH_DELAY, PLAYING_REFRESH_DELAY - sinceLast);
}

function isPlayingHere(): boolean {
  const video = getActiveVideo()?.video;
  if (video && !video.paused) return true;
  return Array.from(document.querySelectorAll('audio')).some((a) => !a.paused);
}

/**
 * Keeps what is on screen in step with the server: new and removed media (library scans), and
 * watched state, favourites and resume positions changed on other devices. Renders nothing.
 */
export function LiveUpdates() {
  const socket = useSocket();
  const qc = useQueryClient();

  useEffect(() => {
    if (!socket) return;
    let timer: number | undefined;
    let last = 0;
    const schedule = () => {
      if (timer !== undefined) return;
      timer = window.setTimeout(
        () => {
          timer = undefined;
          last = Date.now();
          void qc.invalidateQueries({ queryKey: [MEDIA] });
        },
        refreshDelay(isPlayingHere(), Date.now() - last),
      );
    };
    const offLibrary = socket.on('LibraryChanged', schedule);
    const offUserData = socket.on('UserDataChanged', schedule);
    // Whatever happened while the connection was down was missed, so catch up when it returns.
    let first = true;
    const offOpen = socket.onOpen(() => {
      if (first) first = false;
      else schedule();
    });
    return () => {
      window.clearTimeout(timer);
      offLibrary();
      offUserData();
      offOpen();
    };
  }, [socket, qc]);

  return null;
}
