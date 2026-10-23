import { useEffect } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { SessionInfo, TaskInfo } from '@/api/types';
import { useSocket } from './RealtimeProvider';

/** The same window as `/Sessions?activeWithinSeconds=960`, which the dashboard asks for. */
const ACTIVE_WITHIN = 960_000;

/**
 * What Jellyfin can push over the WebSocket instead of being asked every few seconds: the sessions
 * (on every start, stop and progress report) and the scheduled tasks (while they change). Each
 * feed's data is put in the query the REST call fills, in the same form.
 */
const FEEDS = {
  Sessions: {
    key: ['admin', 'sessions'],
    pick: (data: SessionInfo[], now: number) =>
      data.filter((s) => s.LastActivityDate && now - Date.parse(s.LastActivityDate) <= ACTIVE_WITHIN),
  },
  ScheduledTasksInfo: {
    key: ['admin', 'tasks'],
    pick: (data: TaskInfo[]) => data.filter((task) => !task.IsHidden),
  },
} satisfies Record<string, { key: QueryKey; pick: (data: never, now: number) => unknown }>;

/**
 * Subscribes to one of the server's feeds while mounted. Returns whether the socket is connected,
 * in which case asking over REST is only needed now and then, as a safety net.
 */
export function useServerFeed(name: keyof typeof FEEDS): () => boolean {
  const socket = useSocket();
  const qc = useQueryClient();
  useEffect(() => {
    if (!socket) return;
    const feed = FEEDS[name];
    // Start at once, then at most every 1.5 s.
    const offOpen = socket.onOpen(() => socket.send(`${name}Start`, '0,1500'));
    const offData = socket.on<never>(name, (data) => {
      if (Array.isArray(data)) qc.setQueryData(feed.key, feed.pick(data, Date.now()));
    });
    return () => {
      offOpen();
      offData();
      socket.send(`${name}Stop`);
    };
  }, [socket, qc, name]);
  return () => Boolean(socket?.isOpen);
}
