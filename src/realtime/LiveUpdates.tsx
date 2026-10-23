import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MEDIA, patchCachedUserData } from '@/api/queries';
import type { UserItemData } from '@/api/types';
import { useSocket } from './RealtimeProvider';

/** Changes are collected for this long before the lists are fetched again. */
export const REFRESH_DELAY = 1500;

/** What a "user data changed" message carries: each changed item's new user data. */
interface UserDataChanged {
  UserDataList?: (UserItemData & { ItemId?: string; Key?: string })[];
}

/** The changed fields of each item, by item id as the lists have it (no dashes, lower case). */
export function userDataPatches(data: UserDataChanged | undefined): [string, Partial<UserItemData>][] {
  const out: [string, Partial<UserItemData>][] = [];
  for (const entry of data?.UserDataList ?? []) {
    const { ItemId, Key: _key, ...patch } = entry;
    if (ItemId) out.push([ItemId.replace(/-/g, '').toLowerCase(), patch]);
  }
  return out;
}

/**
 * Keeps what is on screen in step with the server: new and removed media (library scans), and
 * watched state, favourites and resume positions changed on other devices. Renders nothing.
 *
 * A library change fetches the lists again. Changed user data comes every few seconds while
 * something plays (on any of the user's devices), and fetching every list again each time would mean
 * every page of every long list; it is put straight into the cached lists instead, and they are only
 * marked as out of date (Continue Watching, counts on shows), to be fetched when next shown.
 */
export function LiveUpdates() {
  const socket = useSocket();
  const qc = useQueryClient();

  useEffect(() => {
    if (!socket) return;
    let timer: number | undefined;
    const schedule = () => {
      if (timer !== undefined) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        void qc.invalidateQueries({ queryKey: [MEDIA] });
      }, REFRESH_DELAY);
    };
    const offLibrary = socket.on('LibraryChanged', schedule);
    const offUserData = socket.on<UserDataChanged>('UserDataChanged', (data) => {
      for (const [id, patch] of userDataPatches(data)) patchCachedUserData(qc, id, patch);
      void qc.invalidateQueries({ queryKey: [MEDIA], refetchType: 'none' });
    });
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
