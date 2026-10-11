import { useCallback, useEffect, useState, type RefObject } from 'react';

/** Safari's AirPlay additions to the video element. */
type AirPlayVideo = HTMLVideoElement & {
  webkitShowPlaybackTargetPicker?: () => void;
  webkitCurrentPlaybackTargetIsWireless?: boolean;
};

export const airPlaySupported =
  typeof window !== 'undefined' && 'WebKitPlaybackTargetAvailabilityEvent' in window;

/**
 * AirPlay for the video element (Safari on Mac, iPhone and iPad). `available` turns true once an
 * AirPlay device is on the network; `active` while the video is being sent to one.
 */
export function useAirPlay(videoRef: RefObject<HTMLVideoElement | null>) {
  const [available, setAvailable] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const video = videoRef.current as AirPlayVideo | null;
    if (!video || !airPlaySupported) return;
    video.setAttribute('x-webkit-airplay', 'allow');
    const onAvailability = (e: Event) => setAvailable((e as Event & { availability?: string }).availability === 'available');
    const onWireless = () => setActive(Boolean(video.webkitCurrentPlaybackTargetIsWireless));
    video.addEventListener('webkitplaybacktargetavailabilitychanged', onAvailability);
    video.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', onWireless);
    return () => {
      video.removeEventListener('webkitplaybacktargetavailabilitychanged', onAvailability);
      video.removeEventListener('webkitcurrentplaybacktargetiswirelesschanged', onWireless);
    };
  }, [videoRef]);

  /** Opens the system's device list. Has to be called from a click. */
  const pick = useCallback(() => {
    (videoRef.current as AirPlayVideo | null)?.webkitShowPlaybackTargetPicker?.();
  }, [videoRef]);

  return { available, active, pick };
}
