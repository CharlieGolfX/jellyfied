import type { JellyfinApi } from '@/api/client';
import type { JellyfinSocket } from '@/realtime/socket';

/**
 * SyncPlay ("watch together"). The server owns the group state: clients ask it to pause, resume
 * or seek, and it answers every member with a command that says what to do and at which moment.
 * This class keeps the local <video> element following those commands.
 */

const TICKS_PER_MS = 10_000;

export interface SyncPlayGroup {
  GroupId: string;
  GroupName: string;
  State: 'Idle' | 'Waiting' | 'Paused' | 'Playing';
  Participants: string[];
}

interface QueueItem {
  ItemId: string;
  PlaylistItemId: string;
}

interface QueueUpdate {
  Reason: string;
  LastUpdate: string;
  Playlist: QueueItem[];
  PlayingItemIndex: number;
  StartPositionTicks: number;
  IsPlaying: boolean;
}

interface GroupUpdate {
  GroupId: string;
  Type:
    | 'UserJoined'
    | 'UserLeft'
    | 'GroupJoined'
    | 'GroupLeft'
    | 'StateUpdate'
    | 'PlayQueue'
    | 'NotInGroup'
    | 'GroupDoesNotExist'
    | 'LibraryAccessDenied';
  Data: unknown;
}

interface SyncCommand {
  GroupId: string;
  PlaylistItemId: string;
  When: string;
  PositionTicks: number | null;
  Command: 'Unpause' | 'Pause' | 'Stop' | 'Seek';
}

/** What the UI shows. A new object whenever something changes. */
export interface SyncPlaySnapshot {
  group: SyncPlayGroup | null;
  /** The group has something in its queue. */
  hasQueue: boolean;
  /** This browser is playing along with the group. */
  following: boolean;
  /** Playlist entry the local player is on, when following. */
  playlistItemId: string | null;
}

/** Request to open the player for a group item. */
export interface SyncPlayOpenRequest {
  itemId: string;
  playlistItemId: string;
  startPositionTicks: number;
  queue: string[];
}

export type SyncPlayNotice = { type: 'joined' | 'left'; user: string } | { type: 'info' | 'error'; message: string };

const EMPTY: SyncPlaySnapshot = { group: null, hasQueue: false, following: false, playlistItemId: null };

/** The server writes 7 fractional digits; keep 3 so every browser parses it. */
function parseTime(iso: string): number {
  return Date.parse(iso.replace(/(\.\d{3})\d+/, '$1'));
}

const normId = (id: string) => id.replace(/-/g, '').toLowerCase();

/** Remembers the group across a page reload (the server keeps the membership, the page does not). */
const GROUP_KEY = 'jellyplex.syncPlayGroup';
function storedGroup(): string | null {
  try {
    return sessionStorage.getItem(GROUP_KEY);
  } catch {
    return null;
  }
}
function storeGroup(id: string | null) {
  try {
    if (id) sessionStorage.setItem(GROUP_KEY, id);
    else sessionStorage.removeItem(GROUP_KEY);
  } catch {
    /* ignore */
  }
}

export class SyncPlayManager {
  private snapshot: SyncPlaySnapshot = EMPTY;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribe: (() => void)[] = [];

  private queue: QueueUpdate | null = null;
  /** Server clock minus local clock, in ms. */
  private offset = 0;
  private samples: { offset: number; delay: number }[] = [];
  private timeTimer: number | undefined;

  // Local playback that follows the group.
  private video: HTMLVideoElement | null = null;
  private playlistItemId: string | null = null;
  private videoCleanup: (() => void) | null = null;
  private detachTimer: number | undefined;
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

  onOpen: ((req: SyncPlayOpenRequest) => void) | null = null;
  onStop: (() => void) | null = null;
  onNotice: ((notice: SyncPlayNotice) => void) | null = null;

  private readonly api: JellyfinApi;

  constructor(api: JellyfinApi, socket: JellyfinSocket) {
    this.api = api;
    this.unsubscribe.push(
      socket.on<GroupUpdate>('SyncPlayGroupUpdate', (u) => this.handleUpdate(u)),
      socket.on<SyncCommand>('SyncPlayCommand', (c) => this.handleCommand(c)),
      // After a page reload, pick the group up again.
      socket.onOpen(() => {
        const id = storedGroup();
        if (id && !this.inGroup) void this.joinGroup(id).catch(() => storeGroup(null));
      }),
    );
  }

  dispose() {
    this.unsubscribe.forEach((u) => u());
    this.stopTimeSync();
    this.releaseVideo();
    window.clearTimeout(this.detachTimer);
    // Signing out (the only time this runs outside development): don't leave a ghost member behind.
    if (this.snapshot.group) {
      storeGroup(null);
      void this.api.post('/SyncPlay/Leave').catch(() => {});
    }
  }

  // ---- Store ---------------------------------------------------------------

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  getSnapshot = () => this.snapshot;

  private update(patch: Partial<SyncPlaySnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((l) => l());
  }

  get inGroup(): boolean {
    return this.snapshot.group !== null;
  }

  // ---- Clock ---------------------------------------------------------------

  private serverNow(): number {
    return Date.now() + this.offset;
  }

  private toLocal(serverIso: string): number {
    return parseTime(serverIso) - this.offset;
  }

  private async sampleTime() {
    try {
      const t0 = Date.now();
      const r = await this.api.get<{ RequestReceptionTime: string; ResponseTransmissionTime: string }>('/GetUtcTime');
      const t3 = Date.now();
      const t1 = parseTime(r.RequestReceptionTime);
      const t2 = parseTime(r.ResponseTransmissionTime);
      if (!Number.isFinite(t1) || !Number.isFinite(t2)) return;
      const delay = Math.max(0, t3 - t0 - (t2 - t1));
      this.samples.push({ offset: (t1 - t0 + (t2 - t3)) / 2, delay });
      if (this.samples.length > 8) this.samples.shift();
      // The sample with the shortest round trip is the most trustworthy.
      const best = this.samples.reduce((a, b) => (b.delay < a.delay ? b : a));
      this.offset = best.offset;
      if (this.inGroup) void this.api.post('/SyncPlay/Ping', { Ping: Math.round(best.delay / 2) }).catch(() => {});
    } catch {
      /* try again on the next round */
    }
  }

  private startTimeSync() {
    if (this.timeTimer !== undefined) return;
    this.samples = [];
    void (async () => {
      for (let i = 0; i < 3; i++) await this.sampleTime();
    })();
    this.timeTimer = window.setInterval(() => void this.sampleTime(), 30_000);
  }

  private stopTimeSync() {
    window.clearInterval(this.timeTimer);
    this.timeTimer = undefined;
  }

  // ---- Group membership ----------------------------------------------------

  listGroups(): Promise<SyncPlayGroup[]> {
    return this.api.get<SyncPlayGroup[]>('/SyncPlay/List');
  }

  async createGroup(name: string) {
    this.startTimeSync();
    await this.api.post('/SyncPlay/New', { GroupName: name });
  }

  async joinGroup(groupId: string) {
    this.startTimeSync();
    await this.api.post('/SyncPlay/Join', { GroupId: groupId });
  }

  async leaveGroup() {
    await this.api.post('/SyncPlay/Leave');
  }

  private clearGroup() {
    storeGroup(null);
    this.queue = null;
    this.stopTimeSync();
    this.releaseVideo();
    this.update(EMPTY);
  }

  private async refreshGroup() {
    const id = this.snapshot.group?.GroupId;
    if (!id) return;
    try {
      const group = await this.api.get<SyncPlayGroup>(`/SyncPlay/${id}`);
      if (this.snapshot.group?.GroupId === id) this.update({ group });
    } catch {
      /* ignore */
    }
  }

  private handleUpdate(u: GroupUpdate) {
    switch (u.Type) {
      case 'GroupJoined':
        storeGroup((u.Data as SyncPlayGroup).GroupId);
        this.queue = null;
        this.startTimeSync();
        this.update({ group: u.Data as SyncPlayGroup, hasQueue: false, following: true, playlistItemId: null });
        break;
      case 'UserJoined':
        this.onNotice?.({ type: 'joined', user: String(u.Data) });
        void this.refreshGroup();
        break;
      case 'UserLeft':
        this.onNotice?.({ type: 'left', user: String(u.Data) });
        void this.refreshGroup();
        break;
      case 'GroupLeft':
      case 'NotInGroup':
        if (this.inGroup) this.clearGroup();
        break;
      case 'GroupDoesNotExist':
        // Also the answer when a remembered group has ended in the meantime: nothing to report then.
        if (this.inGroup) {
          this.onNotice?.({ type: 'error', message: 'That SyncPlay group no longer exists.' });
          this.clearGroup();
        } else storeGroup(null);
        break;
      case 'LibraryAccessDenied':
        this.onNotice?.({ type: 'error', message: 'You don’t have access to what this SyncPlay group is watching.' });
        break;
      case 'StateUpdate': {
        const state = (u.Data as { State?: SyncPlayGroup['State'] })?.State;
        if (state && this.snapshot.group) this.update({ group: { ...this.snapshot.group, State: state } });
        break;
      }
      case 'PlayQueue':
        this.handleQueue(u.Data as QueueUpdate);
        break;
    }
  }

  // ---- Queue ---------------------------------------------------------------

  private currentQueueItem(): QueueItem | null {
    const q = this.queue;
    return q && q.PlayingItemIndex >= 0 ? (q.Playlist[q.PlayingItemIndex] ?? null) : null;
  }

  private handleQueue(q: QueueUpdate) {
    if (!this.inGroup) return;
    this.queue = q;
    const current = this.currentQueueItem();
    this.update({ hasQueue: Boolean(current) });
    if (!current || !this.snapshot.following) return;
    if (!['NewPlaylist', 'SetCurrentItem', 'NextItem', 'PreviousItem'].includes(q.Reason)) return;
    // Already on this entry (e.g. the server re-sent the queue): nothing to open.
    if (this.video && this.playlistItemId === current.PlaylistItemId) return;
    this.open(current, q);
  }

  private open(current: QueueItem, q: QueueUpdate) {
    let start = q.StartPositionTicks;
    if (q.IsPlaying) start += Math.max(0, this.serverNow() - parseTime(q.LastUpdate)) * TICKS_PER_MS;
    this.onOpen?.({
      itemId: current.ItemId,
      playlistItemId: current.PlaylistItemId,
      startPositionTicks: Math.max(0, Math.round(start)),
      queue: q.Playlist.map((p) => p.ItemId),
    });
  }

  /** Start something new for the whole group. */
  async setQueue(itemIds: string[], startIndex: number, startPositionTicks: number) {
    window.clearTimeout(this.detachTimer);
    if (!this.snapshot.following) {
      this.update({ following: true });
      await this.api.post('/SyncPlay/SetIgnoreWait', { IgnoreWait: false }).catch(() => {});
    }
    await this.api.post('/SyncPlay/SetNewQueue', {
      PlayingQueue: itemIds,
      PlayingItemPosition: startIndex,
      StartPositionTicks: Math.max(0, Math.round(startPositionTicks)),
    });
  }

  /** Open the player again after having stopped locally while the group went on. */
  rejoinPlayback() {
    const current = this.currentQueueItem();
    if (!current || !this.queue) return;
    window.clearTimeout(this.detachTimer);
    this.update({ following: true });
    void this.api.post('/SyncPlay/SetIgnoreWait', { IgnoreWait: false }).catch(() => {});
    this.open(current, this.queue);
  }

  /** Move the group on to the next queue entry. Returns false when there is none. */
  requestNext(): boolean {
    const q = this.queue;
    if (!q || !this.playlistItemId || q.PlayingItemIndex >= q.Playlist.length - 1) return false;
    void this.api.post('/SyncPlay/NextItem', { PlaylistItemId: this.playlistItemId }).catch(() => {});
    return true;
  }

  // ---- Local player --------------------------------------------------------

  /** Called by the video player when it starts on a group item. Returns the matching detach. */
  attach(video: HTMLVideoElement, playlistItemId: string): () => void {
    window.clearTimeout(this.detachTimer);
    this.releaseVideo();
    this.video = video;
    this.playlistItemId = playlistItemId;
    this.phase = 'loading';
    this.desired = 'paused';
    this.expectedSeek = null;
    this.lastUnpause = null;
    this.buffering = false;
    this.update({ following: true, playlistItemId });

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
        if (this.video !== video || this.phase !== 'synced' || this.desired !== 'playing') return;
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
    this.videoCleanup = () => events.forEach(([e, h]) => video.removeEventListener(e, h));

    return () => {
      if (this.video !== video) return;
      this.releaseVideo();
      this.update({ playlistItemId: null });
      // Moving on to the next item re-attaches right away. Otherwise the player was closed: tell the
      // server not to hold the group up waiting for this browser.
      this.detachTimer = window.setTimeout(() => {
        if (this.video || !this.inGroup) return;
        this.update({ following: false });
        void this.api.post('/SyncPlay/SetIgnoreWait', { IgnoreWait: true }).catch(() => {});
      }, 800);
    };
  }

  /**
   * The player is loading a new stream for the same item (quality or audio track change). It reports
   * Ready again when it has buffered, and the server answers with where the group is by then.
   */
  reloading() {
    if (!this.video) return;
    window.clearTimeout(this.playTimer);
    this.phase = 'loading';
    this.desired = 'paused';
    this.lastUnpause = null;
    this.buffering = false;
  }

  private releaseVideo() {
    window.clearTimeout(this.playTimer);
    window.clearInterval(this.driftTimer);
    window.clearTimeout(this.rateTimer);
    window.clearTimeout(this.stallTimer);
    this.videoCleanup?.();
    this.videoCleanup = null;
    if (this.video) this.video.playbackRate = this.video.defaultPlaybackRate || 1;
    this.video = null;
    this.playlistItemId = null;
  }

  private positionReport() {
    return {
      When: new Date(this.serverNow()).toISOString(),
      PositionTicks: Math.round((this.video?.currentTime ?? 0) * 1000 * TICKS_PER_MS),
      PlaylistItemId: this.playlistItemId,
    };
  }

  private sendReady() {
    if (!this.video) return;
    void this.api.post('/SyncPlay/Ready', { ...this.positionReport(), IsPlaying: !this.video.paused }).catch(() => {});
  }

  private seekLocal(seconds: number) {
    const video = this.video;
    if (!video) return;
    this.expectedSeek = seconds;
    video.currentTime = seconds;
  }

  /** Runs `cb` once the player can play from where it is. */
  private whenBuffered(cb: () => void) {
    const video = this.video;
    if (!video) return;
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
      if (this.video === video) cb();
    };
    const check = () => {
      if (video.readyState >= 3) finish();
    };
    video.addEventListener('canplay', finish);
    video.addEventListener('seeked', check);
    const timer = window.setTimeout(finish, 10_000);
  }

  private handleCommand(c: SyncCommand) {
    const video = this.video;
    if (c.Command === 'Stop') {
      // Also sent when joining an idle group, when there is nothing to stop.
      if (video && this.snapshot.following && this.playlistItemId) this.onStop?.();
      return;
    }
    if (!video || !this.playlistItemId || normId(c.PlaylistItemId) !== normId(this.playlistItemId)) return;
    const position = (c.PositionTicks ?? 0) / TICKS_PER_MS / 1000;
    const delay = this.toLocal(c.When) - Date.now();
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
    if (this.video && this.video.playbackRate !== 1) this.video.playbackRate = 1;
  }

  /** Keeps a playing video on the group's timeline. */
  private correctDrift() {
    const video = this.video;
    const ref = this.lastUnpause;
    if (!video || !ref || this.desired !== 'playing' || video.paused || video.seeking || this.buffering) return;
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
