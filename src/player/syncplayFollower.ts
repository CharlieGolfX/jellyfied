import type { JellyfinApi } from '@/api/client';
import type { ServerClock } from './syncplayClock';
import { TICKS_PER_MS, type SyncCommand } from './syncplayProtocol';

/**
 * Keeps one <video> element, playing one group queue entry, following the server's commands, and
 * tells the server what the user does to it (pause, play, seek) and when it stalls.
 */
export class SyncPlayFollower {
  readonly video: HTMLVideoElement;
  readonly playlistItemId: string;

  /** 'loading' until the player has buffered and reported Ready for the first time. */
  private phase: 'loading' | 'synced' = 'loading';
  /** What the last command from the server wants the player to be doing. */
  private desired: 'playing' | 'paused' = 'paused';
  private expectedSeek: number | null = null;
  private playTimer: number | undefined;
  private driftTimer: number | undefined;
  private rateTimer: number | undefined;
  private lastUnpause: { at: number; position: number } | null = null;
  private buffering = false;
  private stallTimer: number | undefined;
  private disposed = false;
  private readonly cleanup: () => void;

  private readonly api: JellyfinApi;
  private readonly clock: ServerClock;

  constructor(api: JellyfinApi, clock: ServerClock, video: HTMLVideoElement, playlistItemId: string) {
    this.api = api;
    this.clock = clock;
    this.video = video;
    this.playlistItemId = playlistItemId;

    const onCanPlay = () => {
      if (this.phase === 'loading') {
        this.phase = 'synced';
        this.sendReady();
      } else if (this.buffering) {
        this.buffering = false;
        this.sendReady();
      }
    };
    const onPlay = () => {
      if (this.desired === 'playing') return;
      // The group is paused (or we are not ready yet): hold, and ask everyone to resume together.
      video.pause();
      if (this.phase === 'synced') void this.api.post('/SyncPlay/Unpause').catch(() => {});
    };
    const onPause = () => {
      if (this.desired !== 'playing' || this.phase !== 'synced' || video.ended) return;
      // Paused locally (button, media key, picture-in-picture…): pause the whole group.
      void this.api.post('/SyncPlay/Pause').catch(() => {});
    };
    const onSeeking = () => {
      if (this.phase !== 'synced') return;
      if (this.expectedSeek !== null && Math.abs(video.currentTime - this.expectedSeek) < 1) return;
      // The user moved the playhead: move everyone.
      void this.api.post('/SyncPlay/Seek', { PositionTicks: Math.round(video.currentTime * 1000 * TICKS_PER_MS) }).catch(() => {});
    };
    const onSeeked = () => {
      this.expectedSeek = null;
    };
    const onWaiting = () => {
      // Brief hiccups right after starting or seeking are normal; only report a real stall.
      window.clearTimeout(this.stallTimer);
      this.stallTimer = window.setTimeout(() => {
        if (this.phase !== 'synced' || this.desired !== 'playing') return;
        if (video.paused || video.seeking || video.readyState >= 3 || this.buffering) return;
        this.buffering = true;
        void this.api.post('/SyncPlay/Buffering', { ...this.positionReport(), IsPlaying: false }).catch(() => {});
      }, 500);
    };
    const events: [string, () => void][] = [
      ['canplay', onCanPlay],
      ['playing', onCanPlay],
      ['play', onPlay],
      ['pause', onPause],
      ['seeking', onSeeking],
      ['seeked', onSeeked],
      ['waiting', onWaiting],
    ];
    events.forEach(([e, h]) => video.addEventListener(e, h));
    this.driftTimer = window.setInterval(() => this.correctDrift(), 2000);
    this.cleanup = () => events.forEach(([e, h]) => video.removeEventListener(e, h));
  }

  /**
   * The player is loading a new stream for the same item (quality or audio track change). It reports
   * Ready again when it has buffered, and the server answers with where the group is by then.
   */
  reloading() {
    window.clearTimeout(this.playTimer);
    this.phase = 'loading';
    this.desired = 'paused';
    this.lastUnpause = null;
    this.buffering = false;
  }

  /** Stops following, and leaves the video at its normal speed. */
  dispose() {
    this.disposed = true;
    window.clearTimeout(this.playTimer);
    window.clearInterval(this.driftTimer);
    window.clearTimeout(this.rateTimer);
    window.clearTimeout(this.stallTimer);
    this.cleanup();
    this.video.playbackRate = this.video.defaultPlaybackRate || 1;
  }

  private positionReport() {
    return {
      When: new Date(this.clock.now()).toISOString(),
      PositionTicks: Math.round(this.video.currentTime * 1000 * TICKS_PER_MS),
      PlaylistItemId: this.playlistItemId,
    };
  }

  private sendReady() {
    void this.api.post('/SyncPlay/Ready', { ...this.positionReport(), IsPlaying: !this.video.paused }).catch(() => {});
  }

  private seekLocal(seconds: number) {
    this.expectedSeek = seconds;
    this.video.currentTime = seconds;
  }

  /** Runs `cb` once the player can play from where it is, unless it has stopped following by then. */
  private whenBuffered(cb: () => void) {
    const video = this.video;
    if (!video.seeking && video.readyState >= 3) {
      cb();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('canplay', finish);
      video.removeEventListener('seeked', check);
      window.clearTimeout(timer);
      if (!this.disposed) cb();
    };
    const check = () => {
      if (video.readyState >= 3) finish();
    };
    video.addEventListener('canplay', finish);
    video.addEventListener('seeked', check);
    const timer = window.setTimeout(finish, 10_000);
  }

  /** Does what a Pause, Unpause or Seek command for this entry says. */
  command(c: SyncCommand) {
    const video = this.video;
    const position = (c.PositionTicks ?? 0) / TICKS_PER_MS / 1000;
    const delay = this.clock.toLocal(c.When) - Date.now();
    window.clearTimeout(this.playTimer);
    this.resetRate();

    switch (c.Command) {
      case 'Unpause': {
        this.desired = 'playing';
        this.buffering = false;
        this.lastUnpause = { at: Date.now() + delay, position };
        if (delay > 0) {
          if (Math.abs(video.currentTime - position) > 0.25) this.seekLocal(position);
          this.playTimer = window.setTimeout(() => void video.play().catch(() => {}), delay);
        } else {
          // The moment has passed (slow connection, or we joined late): catch up.
          const target = position - delay / 1000;
          if (Math.abs(video.currentTime - target) > 0.25) this.seekLocal(target);
          void video.play().catch(() => {});
        }
        break;
      }
      case 'Pause':
        this.desired = 'paused';
        this.lastUnpause = null;
        video.pause();
        if (Math.abs(video.currentTime - position) > 0.25) this.seekLocal(position);
        break;
      case 'Seek':
        this.desired = 'paused';
        this.lastUnpause = null;
        video.pause();
        this.seekLocal(position);
        // The group resumes once every member has reported that it is ready at the new position.
        this.whenBuffered(() => this.sendReady());
        break;
    }
  }

  private resetRate() {
    window.clearTimeout(this.rateTimer);
    if (this.video.playbackRate !== 1) this.video.playbackRate = 1;
  }

  /** Keeps a playing video on the group's timeline. */
  private correctDrift() {
    const video = this.video;
    const ref = this.lastUnpause;
    if (!ref || this.desired !== 'playing' || video.paused || video.seeking || this.buffering) return;
    const elapsed = (Date.now() - ref.at) / 1000;
    if (elapsed < 1) return;
    const diff = video.currentTime - (ref.position + elapsed);
    if (Math.abs(diff) > 1) {
      // Far off: jump.
      this.seekLocal(ref.position + elapsed);
    } else if (Math.abs(diff) > 0.12 && video.playbackRate === 1) {
      // Slightly off: play a little faster or slower until it is made up.
      video.playbackRate = diff > 0 ? 0.95 : 1.05;
      this.rateTimer = window.setTimeout(() => this.resetRate(), Math.min(8000, (Math.abs(diff) / 0.05) * 1000));
    }
  }
}
