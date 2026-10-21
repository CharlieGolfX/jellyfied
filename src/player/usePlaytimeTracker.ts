import { useEffect, type RefObject } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { playedThrough, recordPlayedThrough, recordPlaytime, type MediaKind } from '@/lib/playtime';

/** Longest step of the playhead between two updates that still counts as playing, not seeking. */
const MAX_STEP = 3;
/** Played seconds are written out in pieces of about this size. */
const WRITE_EVERY = 15;

/**
 * Measures how long `media` actually plays `itemId`, for the account's stats: the playhead's
 * movement while playing, without jumps (seeks) and at normal speed's worth of time. A session
 * that plays most of the title counts it as played once.
 */
export function usePlaytimeTracker(
  mediaRef: RefObject<HTMLMediaElement | null>,
  itemId: string | undefined,
  kind: MediaKind,
  durationSeconds?: number,
) {
  const userId = useAuth().session?.userId;
  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !itemId || !userId) return;
    let last = media.currentTime;
    let unsaved = 0;
    let session = 0;
    let counted = false;
    const save = () => {
      if (unsaved > 0) recordPlaytime(userId, itemId, kind, unsaved);
      unsaved = 0;
    };
    const onTime = () => {
      const now = media.currentTime;
      const step = now - last;
      last = now;
      if (media.paused || step <= 0 || step > MAX_STEP * Math.max(1, media.playbackRate)) return;
      const played = step / (media.playbackRate || 1);
      unsaved += played;
      session += played;
      if (unsaved >= WRITE_EVERY) save();
      const duration = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : (durationSeconds ?? 0);
      if (!counted && playedThrough(kind, session, duration)) {
        counted = true;
        recordPlayedThrough(userId, itemId, kind);
      }
    };
    const onSeek = () => {
      last = media.currentTime;
    };
    media.addEventListener('timeupdate', onTime);
    media.addEventListener('seeked', onSeek);
    media.addEventListener('pause', save);
    window.addEventListener('pagehide', save);
    return () => {
      save();
      media.removeEventListener('timeupdate', onTime);
      media.removeEventListener('seeked', onSeek);
      media.removeEventListener('pause', save);
      window.removeEventListener('pagehide', save);
    };
  }, [mediaRef, itemId, kind, durationSeconds, userId]);
}
