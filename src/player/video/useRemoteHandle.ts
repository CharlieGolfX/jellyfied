import { useEffect, type RefObject } from 'react';
import { useLatest } from '@/lib/useLatest';
import { registerActiveVideo, type ActiveVideo } from '../activePlayer';

/**
 * Lets remote control (other devices) drive this player. The handle is registered once and
 * always calls the latest closures.
 */
export function useRemoteHandle(
  itemId: string,
  videoRef: RefObject<HTMLVideoElement | null>,
  handlers: Omit<ActiveVideo, 'itemId' | 'video'>,
) {
  const controls = useLatest(handlers);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    return registerActiveVideo({
      itemId,
      video,
      play: () => controls.current.play(),
      pause: () => controls.current.pause(),
      seek: (s) => controls.current.seek(s),
      stop: () => controls.current.stop(),
      next: () => controls.current.next(),
      setVolume: (v) => controls.current.setVolume(v),
      setMuted: (m) => controls.current.setMuted(m),
      setAudioIndex: (i) => controls.current.setAudioIndex(i),
      setSubtitleIndex: (i) => controls.current.setSubtitleIndex(i),
      toggleFullscreen: () => controls.current.toggleFullscreen(),
    });
  }, [itemId, videoRef, controls]);
}
