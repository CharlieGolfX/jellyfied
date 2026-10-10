import clsx from 'clsx';
import { Cast, MonitorPlay, Pause, Play, SkipBack, SkipForward, Square, Volume2, VolumeX, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { generateId } from '@/api/device';
import { cardImage, imageSrc } from '@/api/images';
import { CARD_FIELDS } from '@/api/queries';
import type { BaseItemDto, ItemsResult, SessionInfo } from '@/api/types';
import { useApi, useSession } from '@/auth/AuthProvider';
import { Img } from '@/components/ui/States';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { episodeLabel, formatClock, secondsToTicks, ticksToSeconds } from '@/lib/format';
import { useSocket } from '@/realtime/RealtimeProvider';
import { getActiveVideo } from './activePlayer';
import { useAudioPlayer } from './AudioPlayerProvider';
import { setCastTarget, useCastTarget, type RemotePlayCommand } from './castTarget';
import { SeekBar } from './SeekBar';
import { useLocalPlay, type VideoPlayerState } from './usePlay';
import { isPlayPath } from './VideoSession';

// ---------------------------------------------------------------------------
// Sending playback to another device
// ---------------------------------------------------------------------------

function useControllableSessions(enabled: boolean, interval: number) {
  const api = useApi();
  const { userId } = useSession();
  return useQuery({
    queryKey: ['cast-sessions', userId],
    queryFn: async () =>
      (await api.get<SessionInfo[]>('/Sessions', { controllableByUserId: userId })).filter(
        (s) => s.SupportsRemoteControl && s.DeviceId !== api.deviceId,
      ),
    enabled,
    refetchInterval: interval,
    staleTime: 0,
  });
}

function nowPlayingLabel(item: BaseItemDto): string {
  if (item.Type === 'Episode') return `${item.SeriesName ?? ''} ${episodeLabel(item)}`.trim();
  return item.Name ?? '';
}

/** Top-bar button: pick another device to play on. */
export function CastButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const target = useCastTarget();
  const sessions = useControllableSessions(open, 3000);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const list = sessions.data ?? [];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Play on another device"
        title={target ? `Playing on ${target.deviceName}` : 'Play on another device'}
        className={clsx('rounded-full p-2 hover:bg-white/10', open || target ? 'text-accent' : 'text-muted hover:text-fg')}
      >
        <Cast size={20} />
      </button>
      {open && (
        <div className="animate-pop-in absolute top-12 right-0 z-50 w-80 max-w-[calc(100vw-1rem)] rounded-lg bg-base-750 py-2 shadow-2xl ring-1 ring-black/40">
          <div className="px-4 pt-1 pb-2 text-[11px] font-semibold tracking-wider text-faint uppercase">Play on</div>
          <button
            onClick={() => {
              setCastTarget(null);
              setOpen(false);
            }}
            className={clsx('flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-white/10', !target && 'text-accent')}
          >
            <MonitorPlay size={18} className="shrink-0" />
            <span className="min-w-0 flex-1">This device</span>
          </button>
          {sessions.isLoading ? (
            <div className="flex justify-center py-4 text-accent">
              <Spinner size={20} />
            </div>
          ) : list.length === 0 ? (
            <p className="px-4 py-3 text-xs text-faint">
              No other devices found. Open a Jellyfin app on the device you want to play on, signed in to this server.
            </p>
          ) : (
            list.map((s) => (
              <button
                key={s.Id}
                data-testid="cast-target"
                onClick={() => {
                  setCastTarget({
                    sessionId: s.Id,
                    deviceName: s.DeviceName ?? 'Unknown device',
                    client: s.Client ?? '',
                    userName: s.UserName ?? '',
                  });
                  setOpen(false);
                }}
                className={clsx(
                  'flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-white/10',
                  target?.sessionId === s.Id && 'text-accent',
                )}
              >
                <Cast size={18} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{s.DeviceName}</span>
                  <span className="block truncate text-xs text-muted">
                    {[s.Client, s.UserName].filter(Boolean).join(' · ')}
                    {s.NowPlayingItem ? ` · ${nowPlayingLabel(s.NowPlayingItem)}` : ''}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** Bottom bar with the controls for the device playback is being sent to. */
export function RemoteBar() {
  const api = useApi();
  const toast = useToast();
  const target = useCastTarget();
  const sessions = useControllableSessions(Boolean(target), 2000);
  const [, tick] = useState(0);
  // The other device only reports its position every few seconds, so remember the last reported
  // position and when it arrived, and count on from there while it is playing.
  const anchor = useRef<{ key: string; ticks: number; at: number } | null>(null);
  const pending = useRef<{ seek?: number; until: number } | null>(null);

  const session = target ? sessions.data?.find((s) => s.Id === target.sessionId) : undefined;
  const item = session?.NowPlayingItem ?? null;
  const state = session?.PlayState;
  const paused = Boolean(state?.IsPaused);

  const reportedTicks = state?.PositionTicks ?? 0;
  const anchorKey = `${item?.Id ?? ''}|${paused}`;
  if (!anchor.current || anchor.current.key !== anchorKey || anchor.current.ticks !== reportedTicks) {
    // First sight of this state: the report may already be a few seconds old.
    const checkIn = session?.LastPlaybackCheckIn ? Date.parse(session.LastPlaybackCheckIn) : NaN;
    const age = !anchor.current && Number.isFinite(checkIn) ? Math.min(12_000, Math.max(0, Date.now() - checkIn)) : 0;
    anchor.current = { key: anchorKey, ticks: reportedTicks, at: Date.now() - age };
  }

  useEffect(() => {
    if (!item || paused) return;
    const timer = window.setInterval(() => tick((n) => n + 1), 500);
    return () => window.clearInterval(timer);
  }, [item, paused]);

  const refetch = sessions.refetch;
  const command = useCallback(
    async (path: string, query?: Record<string, string | number>, body?: unknown) => {
      if (!target) return;
      try {
        await api.post(`/Sessions/${target.sessionId}/${path}`, body, query);
        window.setTimeout(() => void refetch(), 400);
      } catch (err) {
        toast.error(err);
      }
    },
    [api, target, toast, refetch],
  );

  if (!target) return null;

  const duration = ticksToSeconds(item?.RunTimeTicks);
  let position = ticksToSeconds(reportedTicks);
  if (item && !paused) position += (Date.now() - anchor.current.at) / 1000;
  if (pending.current && pending.current.until > Date.now() && pending.current.seek !== undefined) position = pending.current.seek;
  position = Math.max(0, duration > 0 ? Math.min(position, duration) : position);
  const offline = sessions.isSuccess && !session;
  const volume = state?.VolumeLevel ?? 100;

  return (
    <div
      data-testid="remote-bar"
      className="relative z-30 shrink-0 border-t border-black/50 bg-base-850 shadow-[0_-4px_20px_rgba(0,0,0,0.35)]"
    >
      {item && duration > 0 && (
        <SeekBar
          className="absolute inset-x-0 -top-1.5"
          current={position}
          duration={duration}
          compact
          onSeek={(seconds) => {
            pending.current = { seek: seconds, until: Date.now() + 2500 };
            void command('Playing/Seek', { seekPositionTicks: secondsToTicks(seconds) });
          }}
        />
      )}
      <div className="flex h-[68px] items-center gap-4 px-3 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="relative flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-base-800 text-accent">
            {item ? <Img src={imageSrc(api, cardImage(item, 'landscape'), 240)} className="h-full w-full object-cover" fallback={<Cast size={20} />} /> : <Cast size={20} />}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold" data-testid="remote-title">
              {item ? nowPlayingLabel(item) : offline ? 'Device is offline' : 'Nothing playing'}
            </div>
            <div className="truncate text-xs text-muted">
              <Cast size={12} className="mr-1 inline align-[-1px] text-accent" />
              Playing on {target.deviceName}
              {target.client ? ` · ${target.client}` : ''}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <button onClick={() => void command('Playing/PreviousTrack')} disabled={!item} className="hidden rounded-full p-2 text-fg hover:text-accent disabled:opacity-30 sm:block" aria-label="Previous">
            <SkipBack size={20} fill="currentColor" />
          </button>
          <button
            onClick={() => void command(paused ? 'Playing/Unpause' : 'Playing/Pause')}
            disabled={!item}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-fg text-base-900 transition hover:scale-105 disabled:opacity-30"
            aria-label={paused ? 'Play on device' : 'Pause on device'}
          >
            {paused ? <Play size={20} fill="currentColor" className="ml-0.5" /> : <Pause size={20} fill="currentColor" />}
          </button>
          <button onClick={() => void command('Playing/NextTrack')} disabled={!item} className="hidden rounded-full p-2 text-fg hover:text-accent disabled:opacity-30 sm:block" aria-label="Next">
            <SkipForward size={20} fill="currentColor" />
          </button>
          <button onClick={() => void command('Playing/Stop')} disabled={!item} className="rounded-full p-2 text-fg hover:text-accent disabled:opacity-30" aria-label="Stop on device">
            <Square size={18} fill="currentColor" />
          </button>
          {item && duration > 0 && (
            <span className="hidden w-24 text-center text-xs text-muted tabular-nums md:block" data-testid="remote-time">
              {formatClock(position)} / {formatClock(duration)}
            </span>
          )}
        </div>

        <div className="flex flex-1 items-center justify-end gap-1 sm:gap-2">
          <button
            onClick={() => void command('Command', undefined, { Name: 'ToggleMute', Arguments: {} })}
            disabled={!item}
            className="hidden rounded-full p-2 text-muted hover:text-fg disabled:opacity-30 sm:block"
            aria-label="Mute device"
          >
            {state?.IsMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            key={volume}
            defaultValue={volume}
            disabled={!item}
            onChange={(e) => void command('Command', undefined, { Name: 'SetVolume', Arguments: { Volume: e.target.value } })}
            className="hidden w-24 disabled:opacity-30 lg:block"
            aria-label="Device volume"
          />
          <button
            onClick={() => setCastTarget(null)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted hover:bg-white/10 hover:text-fg"
            aria-label="Stop playing on device"
            title="Disconnect: play on this device again"
          >
            <X size={16} /> <span className="hidden sm:inline">Disconnect</span>
          </button>
        </div>
      </div>
    </div>
  );
}

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
 * Makes this browser tab a target that other Jellyfin apps (and other Jellyplex tabs) can send
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
  ctx.current = { api, userId, navigate, audio, localPlay, toast, qc };

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
            video.seek(video.video.currentTime - 10);
            break;
          case 'FastForward':
            video.seek(video.video.currentTime + 30);
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
          c.audio.seek(c.audio.currentTime - 10);
          break;
        case 'FastForward':
          c.audio.seek(c.audio.currentTime + 30);
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
