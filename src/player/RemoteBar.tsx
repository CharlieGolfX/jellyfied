import { Cast, Pause, Play, SkipBack, SkipForward, Square, Volume2, VolumeX, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { cardImage, imageSrc } from '@/api/images';
import type { BaseItemDto } from '@/api/types';
import { useApi, useSession } from '@/auth/AuthProvider';
import { Img } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { formatClock, secondsToTicks, ticksToSeconds } from '@/lib/format';
import { setCastTarget, useCastTarget, type CastTarget } from './castTarget';
import { castCommand, castSeek, castSetVolume, castToggleMute, disconnectChromecast, useChromecast } from './chromecast';
import { SeekBar } from './SeekBar';
import { useClock } from '@/lib/useClock';
import { nowPlayingLabel, useControllableSessions } from './CastButton';

interface RemoteState {
  PositionTicks?: number | null;
  IsPaused?: boolean;
  IsMuted?: boolean;
  VolumeLevel?: number | null;
}

/**
 * Where the other device is in what it plays, in seconds: its last report, counted on from when
 * that report arrived while it is playing, unless a position was just asked for.
 */
export function remotePosition(opts: {
  reported: number;
  playing: boolean;
  /** When the report arrived (ms). */
  since: number;
  now: number;
  pending: { seek: number; until: number } | null;
  duration: number;
}): number {
  let position = opts.reported;
  if (opts.playing) position += Math.max(0, opts.now - opts.since) / 1000;
  if (opts.pending && opts.pending.until > opts.now) position = opts.pending.seek;
  return Math.max(0, opts.duration > 0 ? Math.min(position, opts.duration) : position);
}

interface RemoteControls {
  playPause: (paused: boolean) => void;
  previous: () => void;
  next: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
  toggleMute: () => void;
  /** 0–100. */
  setVolume: (volume: number) => void;
  disconnect: () => void;
}

/** Bottom bar with the controls for the device playback is being sent to. */
export function RemoteBar() {
  const target = useCastTarget();
  const chromecast = useChromecast();
  if (chromecast.status === 'connected') return <ChromecastRemoteBar />;
  if (target) return <SessionRemoteBar target={target} />;
  return null;
}

/** Another Jellyfin app, controlled through the server. */
function SessionRemoteBar({ target }: { target: CastTarget }) {
  const api = useApi();
  const toast = useToast();
  const sessions = useControllableSessions(true, 2000);
  const session = sessions.data?.find((s) => s.Id === target.sessionId);

  const refetch = sessions.refetch;
  const command = useCallback(
    async (path: string, query?: Record<string, string | number>, body?: unknown) => {
      try {
        await api.post(`/Sessions/${target.sessionId}/${path}`, body, query);
        window.setTimeout(() => void refetch(), 400);
      } catch (err) {
        toast.error(err);
      }
    },
    [api, target, toast, refetch],
  );

  return (
    <RemoteBarView
      deviceName={target.deviceName}
      client={target.client}
      item={session?.NowPlayingItem ?? null}
      state={session?.PlayState}
      checkIn={session?.LastPlaybackCheckIn}
      offline={sessions.isSuccess && !session}
      controls={{
        playPause: (paused) => void command(paused ? 'Playing/Unpause' : 'Playing/Pause'),
        previous: () => void command('Playing/PreviousTrack'),
        next: () => void command('Playing/NextTrack'),
        stop: () => void command('Playing/Stop'),
        seek: (seconds) => void command('Playing/Seek', { seekPositionTicks: secondsToTicks(seconds) }),
        toggleMute: () => void command('Command', undefined, { Name: 'ToggleMute', Arguments: {} }),
        setVolume: (volume) => void command('Command', undefined, { Name: 'SetVolume', Arguments: { Volume: String(volume) } }),
        disconnect: () => setCastTarget(null),
      }}
    />
  );
}

/** A Chromecast, controlled directly. */
function ChromecastRemoteBar() {
  const api = useApi();
  const { serverId } = useSession();
  const toast = useToast();
  const chromecast = useChromecast();
  const auth = useMemo(() => ({ api, serverId }), [api, serverId]);
  const run = (action: Promise<unknown>) => void action.catch((err: unknown) => toast.error(err));

  return (
    <RemoteBarView
      deviceName={chromecast.deviceName}
      client="Chromecast"
      item={chromecast.item}
      state={chromecast.playState ?? undefined}
      checkIn={chromecast.reportedAt}
      offline={false}
      controls={{
        playPause: (paused) => run(castCommand(auth, paused ? 'Unpause' : 'Pause')),
        previous: () => run(castCommand(auth, 'PreviousTrack')),
        next: () => run(castCommand(auth, 'NextTrack')),
        stop: () => run(castCommand(auth, 'Stop')),
        seek: (seconds) => run(castSeek(auth, seconds)),
        toggleMute: () => run(castToggleMute()),
        setVolume: (volume) => run(castSetVolume(volume)),
        disconnect: disconnectChromecast,
      }}
    />
  );
}

function RemoteBarView({
  deviceName,
  client,
  item,
  state,
  checkIn: lastCheckIn,
  offline,
  controls,
}: {
  deviceName: string;
  client: string;
  item: BaseItemDto | null;
  state: RemoteState | undefined;
  /** When the device last reported its position. */
  checkIn?: string | null;
  offline: boolean;
  controls: RemoteControls;
}) {
  const api = useApi();
  const now = useClock(500);
  // The other device only reports its position every few seconds, so remember the last reported
  // position and when it arrived, and count on from there while it is playing.
  const [anchor, setAnchor] = useState<{ key: string; ticks: number; at: number } | null>(null);
  /** A position just asked for, shown until the device has had time to report it. */
  const [pending, setPending] = useState<{ seek: number; until: number } | null>(null);

  const paused = Boolean(state?.IsPaused);

  const reportedTicks = state?.PositionTicks ?? 0;
  const anchorKey = `${item?.Id ?? ''}|${paused}`;
  if (!anchor || anchor.key !== anchorKey || anchor.ticks !== reportedTicks) {
    // First sight of this state: the report may already be a few seconds old.
    const checkIn = lastCheckIn ? Date.parse(lastCheckIn) : NaN;
    const age = !anchor && Number.isFinite(checkIn) ? Math.min(12_000, Math.max(0, now - checkIn)) : 0;
    setAnchor({ key: anchorKey, ticks: reportedTicks, at: now - age });
  }

  const duration = ticksToSeconds(item?.RunTimeTicks);
  const position = remotePosition({
    reported: ticksToSeconds(reportedTicks),
    playing: Boolean(item) && !paused,
    since: anchor?.at ?? now,
    now,
    pending,
    duration,
  });
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
            setPending({ seek: seconds, until: Date.now() + 2500 });
            controls.seek(seconds);
          }}
        />
      )}
      <div className="flex h-[68px] items-center gap-4 px-3 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="relative flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-base-800 text-accent">
            {item ? (
              <Img
                src={imageSrc(api, cardImage(item, 'landscape'), 240)}
                className="h-full w-full object-cover"
                fallback={<Cast size={20} />}
              />
            ) : (
              <Cast size={20} />
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold" data-testid="remote-title">
              {item ? nowPlayingLabel(item) : offline ? 'Device is offline' : 'Nothing playing'}
            </div>
            <div className="truncate text-xs text-muted">
              <Cast size={12} className="mr-1 inline align-[-1px] text-accent" />
              Playing on {deviceName}
              {client ? ` · ${client}` : ''}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={controls.previous}
            disabled={!item}
            className="hidden rounded-full p-2 text-fg hover:text-accent disabled:opacity-30 sm:block"
            aria-label="Previous"
          >
            <SkipBack size={20} fill="currentColor" />
          </button>
          <button
            onClick={() => controls.playPause(paused)}
            disabled={!item}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-fg text-base-900 transition hover:scale-105 disabled:opacity-30"
            aria-label={paused ? 'Play on device' : 'Pause on device'}
          >
            {paused ? <Play size={20} fill="currentColor" className="ml-0.5" /> : <Pause size={20} fill="currentColor" />}
          </button>
          <button
            onClick={controls.next}
            disabled={!item}
            className="hidden rounded-full p-2 text-fg hover:text-accent disabled:opacity-30 sm:block"
            aria-label="Next"
          >
            <SkipForward size={20} fill="currentColor" />
          </button>
          <button
            onClick={controls.stop}
            disabled={!item}
            className="rounded-full p-2 text-fg hover:text-accent disabled:opacity-30"
            aria-label="Stop on device"
          >
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
            onClick={controls.toggleMute}
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
            onChange={(e) => controls.setVolume(Number(e.target.value))}
            className="hidden w-24 disabled:opacity-30 lg:block"
            aria-label="Device volume"
          />
          <button
            onClick={controls.disconnect}
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
