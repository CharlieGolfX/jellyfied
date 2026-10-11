import clsx from 'clsx';
import {
  ArrowLeft,
  ChevronDown,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipForward,
  Users,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { formatClock } from '@/lib/format';
import { SeekBar } from '../SeekBar';
import type { SeekSteps } from '../seekSteps';
import { ControlButton } from './controls';
import { TRICKPLAY_PREVIEW_WIDTH } from './shared';
import { t } from '@/i18n';

const barVisibility = (visible: boolean) => (visible ? 'opacity-100' : 'pointer-events-none opacity-0');

/** The strip along the top of the full-screen player: back, what is playing, minimise and stop. */
export function TopBar({
  visible,
  title,
  subtitle,
  group,
  onMinimize,
  onExit,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  /** The SyncPlay group this playback is part of, if any. */
  group?: { GroupName: string; Participants: string[] } | null;
  onMinimize: () => void;
  onExit: () => void;
}) {
  return (
    <div
      className={clsx(
        'absolute inset-x-0 top-0 z-10 flex items-center gap-4 bg-gradient-to-b from-black/80 to-transparent px-4 pt-4 pb-12 transition-opacity duration-300 sm:px-6',
        barVisibility(visible),
      )}
    >
      <button
        onClick={onMinimize}
        className="rounded-full p-2 text-white hover:bg-white/15"
        aria-label={t('player.video.playerBars.back')}
        title={t('player.video.playerBars.backKeepsPlayingInThe')}
      >
        <ArrowLeft size={26} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-lg font-semibold">{title}</div>
        {subtitle && <div className="truncate text-sm text-white/70">{subtitle}</div>}
      </div>
      {group && (
        <span
          data-testid="syncplay-badge"
          className="hidden items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm text-accent sm:flex"
          title={t('player.video.playerBars.syncplayWatchingWith', { names: group.Participants.join(', ') })}
        >
          <Users size={15} /> {group.GroupName} · {group.Participants.length}
        </span>
      )}
      <button
        onClick={onMinimize}
        className="rounded-full p-2 text-white hover:bg-white/15"
        aria-label={t('player.video.playerBars.minimizePlayer')}
        title={t('player.video.playerBars.minimizePlayer')}
      >
        <ChevronDown size={26} />
      </button>
      <button
        onClick={onExit}
        className="rounded-full p-2 text-white hover:bg-white/15"
        aria-label={t('common.stopPlayback')}
        title={t('common.stopPlayback')}
      >
        <X size={26} />
      </button>
    </div>
  );
}

/**
 * The controls along the bottom of the full-screen player: the seek bar, then play, skip and
 * volume on the left, and on the right the indicators, the menus (passed as children) and full screen.
 */
export function ControlBar({
  visible,
  playing,
  currentTime,
  duration,
  buffered,
  markers,
  renderPreview,
  seekSteps,
  muted,
  volume,
  isFullscreen,
  onSeek,
  onTogglePlay,
  onSkip,
  onNext,
  onMutedChange,
  onVolumeChange,
  onToggleFullscreen,
  indicators,
  children,
}: {
  visible: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  markers?: number[];
  /** Draws the trickplay thumbnail for a position on the seek bar, when the video has them. */
  renderPreview?: (seconds: number) => ReactNode;
  seekSteps: SeekSteps;
  muted: boolean;
  volume: number;
  isFullscreen: boolean;
  onSeek: (seconds: number) => void;
  onTogglePlay: () => void;
  /** Skips by a number of seconds; negative is back. */
  onSkip: (seconds: number) => void;
  /** Present when there is a next item to go to. */
  onNext?: () => void;
  onMutedChange: (muted: boolean | ((muted: boolean) => boolean)) => void;
  onVolumeChange: (volume: number) => void;
  onToggleFullscreen: () => void;
  /** What is shown before the menus: the sleep timer, when it ends, the speed, how it is played. */
  indicators?: ReactNode;
  children?: ReactNode;
}) {
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const remaining = duration - currentTime;
  return (
    <div
      className={clsx(
        'absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pt-16 pb-4 transition-opacity duration-300 sm:px-6',
        barVisibility(visible),
      )}
    >
      <div className="flex items-center gap-3 text-sm text-white/80 tabular-nums">
        <span className="w-16">{formatClock(currentTime)}</span>
        <SeekBar
          className="flex-1"
          current={currentTime}
          duration={duration}
          buffered={buffered}
          onSeek={onSeek}
          markers={markers}
          renderPreview={renderPreview}
          previewWidth={renderPreview ? TRICKPLAY_PREVIEW_WIDTH : undefined}
        />
        <span className="w-16 text-right">-{formatClock(Math.max(0, remaining))}</span>
      </div>
      <div className="mt-2 flex items-center gap-1 sm:gap-2">
        <ControlButton label={playing ? t('common.pause') : t('common.play')} onClick={onTogglePlay}>
          {playing ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
        </ControlButton>
        <ControlButton label={t('player.video.playerBars.backSeconds', { back: seekSteps.back })} onClick={() => onSkip(-seekSteps.back)}>
          <span className="relative">
            <RotateCcw size={24} />
            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold">{seekSteps.back}</span>
          </span>
        </ControlButton>
        <ControlButton
          label={t('player.video.playerBars.forwardSeconds', { forward: seekSteps.forward })}
          onClick={() => onSkip(seekSteps.forward)}
        >
          <span className="relative">
            <RotateCw size={24} />
            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold">{seekSteps.forward}</span>
          </span>
        </ControlButton>
        {onNext && (
          <ControlButton label={t('common.next')} onClick={onNext}>
            <SkipForward size={24} fill="currentColor" />
          </ControlButton>
        )}
        <div className="group/vol ml-1 flex items-center">
          <ControlButton
            label={muted ? t('player.video.playerBars.unmute') : t('player.video.playerBars.mute')}
            onClick={() => onMutedChange((m) => !m)}
          >
            <VolumeIcon size={24} />
          </ControlButton>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={muted ? 0 : volume}
            onChange={(e) => {
              onVolumeChange(Number(e.target.value));
              onMutedChange(false);
            }}
            className="w-0 opacity-0 transition-all group-hover/vol:w-24 group-hover/vol:opacity-100 focus:w-24 focus:opacity-100"
            aria-label={t('player.video.playerBars.volume')}
          />
        </div>

        <div className="flex-1" />

        {indicators}
        {children}
        <ControlButton
          label={isFullscreen ? t('player.video.playerBars.exitFullScreen') : t('player.video.playerBars.fullScreen')}
          onClick={onToggleFullscreen}
        >
          {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
        </ControlButton>
      </div>
    </div>
  );
}
