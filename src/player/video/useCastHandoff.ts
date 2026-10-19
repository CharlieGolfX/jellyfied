import { useEffect, useRef, type RefObject } from 'react';
import type { BaseItemDto } from '@/api/types';
import { useApi, useSession } from '@/auth/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import { t } from '@/i18n';
import { secondsToTicks } from '@/lib/format';
import { castPlay, useChromecast } from '../chromecast';
import type { ActiveStream } from './shared';

/**
 * Chromecast: once one is connected while this video is open, the video moves over to it, where it
 * is, with the same tracks, and `onMoved` closes the player here.
 */
export function useCastHandoff({
  item,
  inSync,
  videoRef,
  streamRef,
  onMoved,
}: {
  item: BaseItemDto | undefined;
  /** A SyncPlay group plays on this browser's screen, not on a Chromecast. */
  inSync: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  streamRef: RefObject<ActiveStream | null>;
  onMoved: () => void;
}) {
  const api = useApi();
  const { serverId } = useSession();
  const toast = useToast();
  const cast = useChromecast();
  const castConnected = cast.status === 'connected';
  const castWasConnected = useRef(castConnected);
  useEffect(() => {
    const was = castWasConnected.current;
    castWasConnected.current = castConnected;
    if (was || !castConnected || !item || inSync) return;
    const s = streamRef.current;
    castPlay({ api, serverId }, [item], {
      startPositionTicks: secondsToTicks(videoRef.current?.currentTime ?? 0),
      mediaSourceId: s?.source.Id,
      audioStreamIndex: s?.audioIndex,
      subtitleStreamIndex: s && s.subIndex >= 0 ? s.subIndex : undefined,
    })
      .then(() => {
        toast.info(t('player.videoPlayer.playingOn', { deviceName: cast.deviceName }));
        onMoved();
      })
      .catch((err: unknown) => toast.error(err));
  }, [castConnected, cast.deviceName, item, inSync, api, serverId, streamRef, videoRef, toast, onMoved]);
  return cast;
}
