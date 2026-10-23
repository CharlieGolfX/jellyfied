import { useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { generateId } from '@/api/device';
import { CARD_FIELDS } from '@/api/queries';
import type { BaseItemDto, ItemsResult } from '@/api/types';
import { useApi, useSession } from '@/auth/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import { ticksToSeconds } from '@/lib/format';
import { useSocket } from '@/realtime/RealtimeProvider';
import { getActiveVideo } from './activePlayer';
import { useAudioPlayer } from './AudioPlayerProvider';
import { type RemotePlayCommand } from './castTarget';
import { getSeekSteps } from './seekSteps';
import { useLocalPlay, type VideoPlayerState } from './usePlay';
import { isPlayPath } from './VideoSession';

// ---------------------------------------------------------------------------
// Being controlled by another device
// ---------------------------------------------------------------------------

const SUPPORTED_COMMANDS = [
  'VolumeUp',
  'VolumeDown',
  'Mute',
  'Unmute',
  'ToggleMute',
  'SetVolume',
  'SetAudioStreamIndex',
  'SetSubtitleStreamIndex',
  'ToggleFullscreen',
  'DisplayContent',
  'DisplayMessage',
  'GoHome',
  'GoToSettings',
  'Back',
];

interface PlayMessage {
  ItemIds?: string[];
  StartPositionTicks?: number | null;
  PlayCommand?: RemotePlayCommand | 'PlayInstantMix';
  StartIndex?: number | null;
  AudioStreamIndex?: number | null;
  SubtitleStreamIndex?: number | null;
  MediaSourceId?: string | null;
}

interface PlaystateMessage {
  Command?: 'Stop' | 'Pause' | 'Unpause' | 'NextTrack' | 'PreviousTrack' | 'Seek' | 'Rewind' | 'FastForward' | 'PlayPause';
  SeekPositionTicks?: number | null;
}

interface GeneralCommandMessage {
  Name?: string;
  Arguments?: Record<string, string>;
}

/**
 * Makes this browser tab a target that other Jellyfin apps (and other Jellyfied tabs) can send
 * playback to and control. Renders nothing.
 */
export function RemoteControlReceiver() {
  const api = useApi();
  const { userId } = useSession();
  const socket = useSocket();
  const navigate = useNavigate();
  const audio = useAudioPlayer();
  const localPlay = useLocalPlay();
  const toast = useToast();
  const qc = useQueryClient();

  // Handlers read the latest values through a ref, so the socket subscriptions stay put.
  const ctx = useRef({ api, userId, navigate, audio, localPlay, toast, qc });
  useLayoutEffect(() => {
    ctx.current = { api, userId, navigate, audio, localPlay, toast, qc };
  });

  useEffect(() => {
    if (!socket) return;
    const offOpen = socket.onOpen(() => {
      void api
        .post('/Sessions/Capabilities/Full', {
          PlayableMediaTypes: ['Audio', 'Video'],
          SupportedCommands: SUPPORTED_COMMANDS,
          SupportsMediaControl: true,
          SupportsPersistentIdentifier: false,
        })
        .catch(() => {});
    });

    const offPlay = socket.on<PlayMessage>('Play', (data) => {
      const c = ctx.current;
      const ids = data?.ItemIds ?? [];
      if (!ids.length) return;
      void (async () => {
        try {
          const result = await c.api.get<ItemsResult>('/Items', {
            userId: c.userId,
            ids,
            fields: [...CARD_FIELDS, 'MediaSources'],
            enableUserData: true,
          });
          // The server does not keep the order of the ids.
          const byId = new Map(result.Items.map((i) => [i.Id, i]));
          const items = ids.map((id) => byId.get(id)).filter((i): i is BaseItemDto => Boolean(i));
          if (!items.length) return;
          const startIndex = Math.min(Math.max(0, data.StartIndex ?? 0), items.length - 1);
          const first = items[startIndex];
          const command = data.PlayCommand ?? 'PlayNow';

          if (first.MediaType === 'Audio' && !first.IsFolder) {
            const tracks = items.filter((i) => i.MediaType === 'Audio' && !i.IsFolder);
            if (command === 'PlayNext') c.audio.playNext(tracks);
            else if (command === 'PlayLast') c.audio.enqueue(tracks);
            else c.audio.play(tracks, Math.max(0, tracks.indexOf(first)));
            return;
          }
          if (first.IsFolder || first.MediaType !== 'Video') {
            // A show, season, album, playlist…: work out what to play the same way a click would.
            await c.localPlay(first, { shuffle: command === 'PlayShuffle', fromStart: data.StartPositionTicks === 0 });
            return;
          }
          const videos = items.filter((i) => i.MediaType === 'Video' && !i.IsFolder).map((i) => i.Id);
          const state: VideoPlayerState = {
            token: generateId(),
            queue: videos.length > 1 ? videos : undefined,
            startPositionTicks: data.StartPositionTicks ?? undefined,
            audioStreamIndex: data.AudioStreamIndex ?? undefined,
            subtitleStreamIndex: data.SubtitleStreamIndex ?? undefined,
            mediaSourceId: data.MediaSourceId ?? undefined,
          };
          c.audio.pause();
          c.navigate(`/play/${first.Id}`, { state, replace: isPlayPath(window.location.pathname) });
        } catch (err) {
          c.toast.error(err);
        }
      })();
    });

    const offPlaystate = socket.on<PlaystateMessage>('Playstate', (data) => {
      const c = ctx.current;
      const video = getActiveVideo();
      const seconds = ticksToSeconds(data?.SeekPositionTicks);
      if (video) {
        switch (data?.Command) {
          case 'Stop':
            video.stop();
            break;
          case 'Pause':
            video.pause();
            break;
          case 'Unpause':
            video.play();
            break;
          case 'PlayPause':
            if (video.video.paused) video.play();
            else video.pause();
            break;
          case 'Seek':
            video.seek(seconds);
            break;
          case 'Rewind':
            video.seek(video.video.currentTime - getSeekSteps().back);
            break;
          case 'FastForward':
            video.seek(video.video.currentTime + getSeekSteps().forward);
            break;
          case 'NextTrack':
            video.next();
            break;
          case 'PreviousTrack':
            video.seek(0);
            break;
        }
        return;
      }
      if (!c.audio.current) return;
      switch (data?.Command) {
        case 'Stop':
          c.audio.stop();
          break;
        case 'Pause':
          c.audio.pause();
          break;
        case 'Unpause':
          if (!c.audio.isPlaying) c.audio.toggle();
          break;
        case 'PlayPause':
          c.audio.toggle();
          break;
        case 'Seek':
          c.audio.seek(seconds);
          break;
        case 'Rewind':
          c.audio.seek(c.audio.getTime() - getSeekSteps().back);
          break;
        case 'FastForward':
          c.audio.seek(c.audio.getTime() + getSeekSteps().forward);
          break;
        case 'NextTrack':
          c.audio.next();
          break;
        case 'PreviousTrack':
          c.audio.previous();
          break;
      }
    });

    const offCommand = socket.on<GeneralCommandMessage>('GeneralCommand', (data) => {
      const c = ctx.current;
      const args = data?.Arguments ?? {};
      const video = getActiveVideo();
      const currentVolume = video ? video.video.volume : c.audio.volume;
      const setVolume = (v: number) => {
        const clamped = Math.min(1, Math.max(0, v));
        if (video) video.setVolume(clamped);
        else c.audio.setVolume(clamped);
      };
      switch (data?.Name) {
        case 'SetVolume':
          if (Number.isFinite(Number(args.Volume))) setVolume(Number(args.Volume) / 100);
          break;
        case 'VolumeUp':
          setVolume(currentVolume + 0.05);
          break;
        case 'VolumeDown':
          setVolume(currentVolume - 0.05);
          break;
        case 'Mute':
          if (video) video.setMuted(true);
          else if (!c.audio.muted) c.audio.toggleMute();
          break;
        case 'Unmute':
          if (video) video.setMuted(false);
          else if (c.audio.muted) c.audio.toggleMute();
          break;
        case 'ToggleMute':
          if (video) video.setMuted('toggle');
          else c.audio.toggleMute();
          break;
        case 'SetAudioStreamIndex':
          if (video && Number.isFinite(Number(args.Index))) video.setAudioIndex(Number(args.Index));
          break;
        case 'SetSubtitleStreamIndex':
          if (video && Number.isFinite(Number(args.Index))) video.setSubtitleIndex(Number(args.Index));
          break;
        case 'ToggleFullscreen':
          video?.toggleFullscreen();
          break;
        case 'DisplayMessage':
          c.toast.info([args.Header, args.Text].filter(Boolean).join(': '));
          break;
        case 'DisplayContent':
          if (args.ItemId) c.navigate(`/item/${args.ItemId}`);
          break;
        case 'GoHome':
          c.navigate('/');
          break;
        case 'GoToSettings':
          c.navigate('/settings');
          break;
        case 'Back':
          window.history.back();
          break;
      }
    });

    return () => {
      offOpen();
      offPlay();
      offPlaystate();
      offCommand();
    };
  }, [socket, api]);

  return null;
}
