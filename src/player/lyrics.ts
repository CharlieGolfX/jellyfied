import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import type { LyricLine, Lyrics } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { ticksToSeconds } from '@/lib/format';

/** Whether the lyrics say when each line is sung (LRC), rather than being plain text. */
export function isTimed(lines: LyricLine[]): boolean {
  return lines.some((l) => typeof l.Start === 'number');
}

/** The line being sung at `seconds`: the last one that has started, or -1 before the first. */
export function currentLine(lines: LyricLine[], seconds: number): number {
  let found = -1;
  for (let i = 0; i < lines.length; i++) {
    const start = lines[i].Start;
    if (typeof start !== 'number') continue;
    if (ticksToSeconds(start) > seconds) break;
    found = i;
  }
  return found;
}

/** A song's lyrics, or null when it has none. Servers before 10.9 have none either. */
export function useLyrics(itemId: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: ['lyrics', itemId],
    enabled: Boolean(itemId),
    staleTime: Infinity,
    queryFn: async (): Promise<LyricLine[] | null> => {
      try {
        const lines = (await api.get<Lyrics>(`/Audio/${itemId}/Lyrics`)).Lyrics ?? [];
        return lines.some((l) => l.Text.trim()) ? lines : null;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  });
}
