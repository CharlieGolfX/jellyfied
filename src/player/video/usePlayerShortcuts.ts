import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { AUDIO_DELAY_STEP, MAX_AUDIO_DELAY } from '../audioDelay';
import type { SeekSteps } from '../seekSteps';
import { clampStep, formatAudioDelay, formatSubtitleDelay, MAX_SUBTITLE_DELAY, SPEED_OPTIONS, type PlayerPanel } from './shared';
import { t } from '@/i18n';

interface ShortcutOptions {
  /** Off for the mini player, which must not hijack page keys. */
  isFull: boolean;
  togglePlay: () => void;
  skip: (delta: number) => void;
  toggleFullscreen: () => void;
  togglePip: () => void;
  minimize: () => void;
  goNext: () => void;
  nextId: string | undefined;
  panel: PlayerPanel;
  setPanel: Dispatch<SetStateAction<PlayerPanel>>;
  /** Shows the controls again. */
  poke: () => void;
  /** Short on-screen note. */
  flash: (text: string) => void;
  speed: number;
  setSpeed: Dispatch<SetStateAction<number>>;
  inSync: boolean;
  /** Subtitles are drawn in the browser, so they can be shifted. */
  subtitleTiming: boolean;
  subtitleDelay: number;
  setSubtitleDelay: Dispatch<SetStateAction<number>>;
  audioDelay: number;
  setAudioDelay: Dispatch<SetStateAction<number>>;
  audioDelayAvailable: boolean;
  setVolume: Dispatch<SetStateAction<number>>;
  setMuted: Dispatch<SetStateAction<boolean>>;
  setShowInfo: Dispatch<SetStateAction<boolean>>;
  showShortcuts: boolean;
  setShowShortcuts: Dispatch<SetStateAction<boolean>>;
  steps: SeekSteps;
}

/** Keyboard shortcuts of the full-screen player (listed in ShortcutsHelp and docs/keyboard-shortcuts.md). */
export function usePlayerShortcuts({
  isFull,
  togglePlay,
  skip,
  toggleFullscreen,
  togglePip,
  minimize,
  goNext,
  nextId,
  panel,
  setPanel,
  poke,
  flash,
  speed,
  setSpeed,
  inSync,
  subtitleTiming,
  subtitleDelay,
  setSubtitleDelay,
  audioDelay,
  setAudioDelay,
  audioDelayAvailable,
  setVolume,
  setMuted,
  setShowInfo,
  showShortcuts,
  setShowShortcuts,
  steps,
}: ShortcutOptions) {
  useEffect(() => {
    if (!isFull) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      let handled = true;
      switch (e.key.length === 1 && e.key !== '<' && e.key !== '>' ? e.key.toLowerCase() : e.key) {
        case ' ':
        case 'k':
          togglePlay();
          break;
        case 'ArrowLeft':
        case 'j':
          skip(-steps.back);
          break;
        case 'ArrowRight':
        case 'l':
          skip(steps.forward);
          break;
        case 'ArrowUp':
          setVolume((v) => Math.min(1, v + 0.05));
          setMuted(false);
          break;
        case 'ArrowDown':
          setVolume((v) => Math.max(0, v - 0.05));
          break;
        case 'm':
          setMuted((m) => !m);
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'n':
          if (nextId) goNext();
          break;
        case 'p':
          togglePip();
          break;
        case 'i':
          setShowInfo((v) => !v);
          break;
        case '?':
          setShowShortcuts((v) => !v);
          break;
        case 'g':
        case 'h':
          if (subtitleTiming) {
            const next = clampStep(subtitleDelay + (e.key.toLowerCase() === 'h' ? 0.1 : -0.1), -MAX_SUBTITLE_DELAY, MAX_SUBTITLE_DELAY);
            setSubtitleDelay(next);
            flash(t('player.subtitleDelay', { delay: formatSubtitleDelay(next) }));
          } else handled = false;
          break;
        case 'z':
        case 'x':
          if (audioDelayAvailable) {
            const next = clampStep(audioDelay + (e.key.toLowerCase() === 'x' ? AUDIO_DELAY_STEP : -AUDIO_DELAY_STEP), 0, MAX_AUDIO_DELAY);
            setAudioDelay(next);
            flash(t('player.audioDelay', { delay: formatAudioDelay(next) }));
          } else handled = false;
          break;
        case '>':
        case '<': {
          if (inSync) break;
          const i = SPEED_OPTIONS.indexOf(speed);
          const next = SPEED_OPTIONS[Math.min(SPEED_OPTIONS.length - 1, Math.max(0, i + (e.key === '>' ? 1 : -1)))];
          setSpeed(next);
          break;
        }
        case 'Escape':
          if (showShortcuts) setShowShortcuts(false);
          else if (panel !== 'none') setPanel('none');
          else if (!document.fullscreenElement) minimize();
          else handled = false;
          break;
        default:
          handled = false;
      }
      if (handled) {
        e.preventDefault();
        poke();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    isFull,
    togglePlay,
    skip,
    toggleFullscreen,
    togglePip,
    minimize,
    goNext,
    nextId,
    panel,
    poke,
    speed,
    subtitleTiming,
    inSync,
    subtitleDelay,
    audioDelay,
    audioDelayAvailable,
    flash,
    setPanel,
    setSpeed,
    setSubtitleDelay,
    setAudioDelay,
    setVolume,
    setMuted,
    setShowInfo,
    showShortcuts,
    setShowShortcuts,
    steps,
  ]);
}
