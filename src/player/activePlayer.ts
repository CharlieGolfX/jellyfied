/**
 * Handle to the video player that is currently mounted, for code outside it that has to drive
 * playback: remote-control commands from other devices and SyncPlay.
 */
export interface ActiveVideo {
  itemId: string;
  video: HTMLVideoElement;
  /** Local controls (these never go through SyncPlay). */
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  stop: () => void;
  next: () => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean | 'toggle') => void;
  setAudioIndex: (index: number) => void;
  setSubtitleIndex: (index: number) => void;
  toggleFullscreen: () => void;
}

let active: ActiveVideo | null = null;
const listeners = new Set<(a: ActiveVideo | null) => void>();

export function registerActiveVideo(player: ActiveVideo): () => void {
  active = player;
  listeners.forEach((l) => l(active));
  return () => {
    if (active !== player) return;
    active = null;
    listeners.forEach((l) => l(null));
  };
}

export function getActiveVideo(): ActiveVideo | null {
  return active;
}

export function onActiveVideoChange(cb: (a: ActiveVideo | null) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
