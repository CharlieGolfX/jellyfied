import { useEffect, useRef, type RefObject } from 'react';
import type { JellyfinApi } from '@/api/client';
import { cardImage, imageSrc } from '@/api/images';
import type { BaseItemDto } from '@/api/types';
import { episodeLabel } from '@/lib/format';

/**
 * OS media controls (media keys, lock screen) for the video. Claimed whenever the video starts
 * playing, since the music player uses the same session.
 */
export function useVideoMediaSession({
  api,
  item,
  videoRef,
  playing,
  nextId,
  togglePlay,
  skip,
  seekTo,
  goNext,
}: {
  api: JellyfinApi;
  item: BaseItemDto | undefined;
  videoRef: RefObject<HTMLVideoElement | null>;
  playing: boolean;
  nextId: string | undefined;
  togglePlay: () => void;
  skip: (delta: number) => void;
  seekTo: (seconds: number) => void;
  goNext: () => void;
}) {
  const mediaMetaRef = useRef<MediaMetadata | null>(null);
  useEffect(() => {
    if (!('mediaSession' in navigator) || !item || !playing) return;
    const ms = navigator.mediaSession;
    const art = imageSrc(api, cardImage(item, 'landscape'), 512);
    const meta = new MediaMetadata({
      title: item.Type === 'Episode' ? `${episodeLabel(item)}${item.Name ? ` · ${item.Name}` : ''}` : (item.Name ?? ''),
      artist: item.Type === 'Episode' ? (item.SeriesName ?? '') : item.ProductionYear ? String(item.ProductionYear) : '',
      artwork: art ? [{ src: art, sizes: '512x288' }] : [],
    });
    mediaMetaRef.current = meta;
    ms.metadata = meta;
    const handlers: [MediaSessionAction, MediaSessionActionHandler | null][] = [
      ['play', () => togglePlay()],
      ['pause', () => videoRef.current?.pause()],
      ['seekbackward', (d) => skip(-(d.seekOffset ?? 10))],
      ['seekforward', (d) => skip(d.seekOffset ?? 30)],
      ['seekto', (d) => d.seekTime !== undefined && seekTo(d.seekTime)],
      ['previoustrack', null],
      ['nexttrack', nextId ? () => goNext() : null],
    ];
    for (const [action, handler] of handlers) {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        /* action not supported by this browser */
      }
    }
  }, [api, item, playing, nextId, togglePlay, skip, seekTo, goNext, videoRef]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const video = videoRef.current;
    if (!video) return;
    const update = () => {
      if (navigator.mediaSession.metadata !== mediaMetaRef.current) return;
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      try {
        navigator.mediaSession.setPositionState({
          duration: video.duration,
          position: Math.min(video.currentTime, video.duration),
          playbackRate: video.playbackRate || 1,
        });
      } catch {
        /* ignore */
      }
    };
    const events = ['playing', 'pause', 'seeked', 'ratechange', 'durationchange'];
    events.forEach((ev) => video.addEventListener(ev, update));
    return () => events.forEach((ev) => video.removeEventListener(ev, update));
  }, [videoRef]);

  // Release the media session when this player goes away, unless music has taken it over.
  useEffect(
    () => () => {
      if (!('mediaSession' in navigator) || navigator.mediaSession.metadata !== mediaMetaRef.current) return;
      const ms = navigator.mediaSession;
      ms.metadata = null;
      for (const action of ['play', 'pause', 'seekbackward', 'seekforward', 'seekto', 'nexttrack'] as MediaSessionAction[]) {
        try {
          ms.setActionHandler(action, null);
        } catch {
          /* ignore */
        }
      }
    },
    [],
  );
}
