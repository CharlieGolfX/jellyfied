import { useEffect, type RefObject } from 'react';
import type Hls from 'hls.js';
import { useApi } from '@/auth/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import { t } from '@/i18n';
import { hasAudioGraph, releaseAudioDelay, setAudioDelay as applyAudioDelay } from '../audioDelay';
import type { ActiveStream, LoadOptions } from './shared';

/**
 * Holds the video's sound back by `delay` seconds. Sound from another origin is silent in Web Audio
 * unless the media was requested with CORS, so such a stream is loaded again with CORS the first
 * time a delay is set. Where the delay can't be applied, it is reset to 0 and the user told.
 */
export function useVideoAudioDelay({
  videoRef,
  delay,
  setDelay,
  available,
  streamRef,
  hlsRef,
  load,
  maxBitrate,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  delay: number;
  setDelay: (seconds: number) => void;
  available: boolean;
  streamRef: RefObject<ActiveStream | null>;
  hlsRef: RefObject<Hls | null>;
  load: (opts: LoadOptions) => Promise<void>;
  maxBitrate: number;
}) {
  const api = useApi();
  const toast = useToast();
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !available) return;
    const crossOrigin = new URL(api.serverUrl, window.location.href).origin !== window.location.origin;
    if (delay !== 0 && crossOrigin && !video.crossOrigin && !hasAudioGraph(video)) {
      video.crossOrigin = 'anonymous';
      const s = streamRef.current;
      if (s && !hlsRef.current) {
        void load({
          start: video.currentTime,
          audioIndex: s.audioIndex,
          subIndex: s.subIndex,
          bitrate: maxBitrate,
          mediaSourceId: s.source.Id,
          forceTranscode: s.method === 'Transcode',
        });
      }
    }
    if (!applyAudioDelay(video, delay) && delay !== 0) {
      toast.error(t('player.videoPlayer.audioDelayUnavailable'));
      setDelay(0);
    }
  }, [delay, available, api, load, maxBitrate, toast, streamRef, hlsRef, videoRef, setDelay]);
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (video) releaseAudioDelay(video);
    };
  }, [videoRef]);
}
