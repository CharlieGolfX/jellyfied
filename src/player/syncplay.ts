import type { JellyfinApi } from '@/api/client';
import type { JellyfinSocket } from '@/realtime/socket';
import { t } from '@/i18n';
import { inviteName } from './syncplayInviteList';
import { ServerClock } from './syncplayClock';
import { SyncPlayFollower } from './syncplayFollower';
import {
  fromServer,
  normId,
  parseTime,
  TICKS_PER_MS,
  type GroupUpdate,
  type QueueItem,
  type QueueUpdate,
  type SyncCommand,
  type SyncPlayGroup,
  type SyncPlayNotice,
  type SyncPlayOpenRequest,
  type SyncPlayQueueState,
} from './syncplayProtocol';
import { playingTab, setPlayingTab, storedGroup, storeGroup, TAB_CLAIM_EVERY, type TabMessage } from './syncplayTabs';

export type { SyncPlayGroup, SyncPlayNotice, SyncPlayOpenRequest, SyncPlayQueueState } from './syncplayProtocol';

/**
 * SyncPlay ("watch together"). The server owns the group state: clients ask it to pause, resume
 * or seek, and it answers every member with a command that says what to do and at which moment.
 * This class keeps track of the group, and has a SyncPlayFollower keep the local <video> (or, for
 * music, <audio>) element following those commands.
 */

/** How long joining or creating a group waits for the live connection. */
const CONNECT_TIMEOUT = 15_000;

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

const EMPTY: SyncPlaySnapshot = { group: null, hasQueue: false, following: false, playlistItemId: null };

export class SyncPlayManager {
  private snapshot: SyncPlaySnapshot = EMPTY;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribe: (() => void)[] = [];

  private queue: QueueUpdate | null = null;
  private readonly clock: ServerClock;

  /** Local playback that follows the group. */
  private follower: SyncPlayFollower | null = null;
  private detachTimer: number | undefined;

  onOpen: ((req: SyncPlayOpenRequest) => void) | null = null;
  /** Any change to the group's queue (added, removed, shuffled, repeat), while playing along. */
  onQueue: ((state: SyncPlayQueueState) => void) | null = null;
  onStop: (() => void) | null = null;
  onNotice: ((notice: SyncPlayNotice) => void) | null = null;

  private readonly api: JellyfinApi;
  private readonly socket: JellyfinSocket;
  private readonly tabs: BroadcastChannel | null;
  private readonly tabId = Math.random().toString(36).slice(2);

  constructor(api: JellyfinApi, socket: JellyfinSocket) {
    this.api = api;
    this.socket = socket;
    this.clock = new ServerClock(api, (delay) => {
      if (this.inGroup) void this.api.post('/SyncPlay/Ping', { Ping: Math.round(delay / 2) }).catch(() => {});
    });
    this.tabs = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`jellyfied.syncPlay.${api.userId ?? ''}`);
    if (this.tabs) this.tabs.onmessage = (e: MessageEvent<TabMessage>) => this.fromTab(e.data);
    const leaving = () => {
      if (playingTab() === this.tabId) setPlayingTab(null);
    };
    window.addEventListener('pagehide', leaving);
    // Keeps this tab's claim to play along fresh, for as long as it has one.
    const renew = window.setInterval(() => {
      if (playingTab() === this.tabId) setPlayingTab(this.tabId);
    }, TAB_CLAIM_EVERY);
    this.unsubscribe.push(
      () => window.removeEventListener('pagehide', leaving),
      () => window.clearInterval(renew),
      socket.on<GroupUpdate>('SyncPlayGroupUpdate', (u) => {
        this.toTabs({ kind: 'update', data: u });
        this.handleUpdate(u, true);
      }),
      socket.on<SyncCommand>('SyncPlayCommand', (c) => {
        this.toTabs({ kind: 'command', data: c });
        this.handleCommand(c);
      }),
      // After a page reload, pick the group up again.
      socket.onOpen(() => {
        const id = storedGroup();
        if (id && !this.inGroup) void this.joinGroup(id).catch(() => storeGroup(null));
      }),
    );
    // A new tab: another one may already be in a group, which then is this tab's too.
    this.toTabs({ kind: 'hello' });
  }

  private toTabs(message: TabMessage) {
    try {
      this.tabs?.postMessage(message);
    } catch {
      /* closed */
    }
  }

  private fromTab(m: TabMessage) {
    switch (m.kind) {
      case 'update':
        this.handleUpdate(m.data, false);
        break;
      case 'command':
        this.handleCommand(m.data);
        break;
      case 'hello':
        if (this.snapshot.group) this.toTabs({ kind: 'state', group: this.snapshot.group, queue: this.queue });
        break;
      case 'state':
        if (this.inGroup) return;
        storeGroup(m.group.GroupId);
        this.queue = m.queue;
        this.clock.start();
        this.update({ group: m.group, hasQueue: Boolean(this.currentQueueItem()), following: false, playlistItemId: null });
        break;
    }
  }

  /** This tab is where SyncPlay is used now: it is the one that plays along. */
  private claimPlayback() {
    setPlayingTab(this.tabId);
  }

  /**
   * Whether this tab opens the player for the group. Another tab's message only counts for the
   * tab that plays along; a message from the server makes the tab that got it play along when no
   * tab does yet.
   */
  private playsAlong(direct: boolean): boolean {
    const tab = playingTab();
    if (tab === this.tabId) return true;
    if (tab || !direct) return false;
    this.claimPlayback();
    return true;
  }

  dispose() {
    this.tabs?.close();
    if (playingTab() === this.tabId) setPlayingTab(null);
    this.unsubscribe.forEach((u) => u());
    this.clock.stop();
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

  // ---- Group membership ----------------------------------------------------

  async listGroups(): Promise<SyncPlayGroup[]> {
    return (await this.api.get<SyncPlayGroup[]>('/SyncPlay/List')).map(fromServer);
  }

  /**
   * Waits for the live connection, which is how the server says the group was joined. A browser
   * can hold it back for a while, for instance after other tabs' attempts to connect failed.
   */
  private connected(timeoutMs = CONNECT_TIMEOUT): Promise<void> {
    return new Promise((resolve, reject) => {
      let stop = () => {};
      const timer = window.setTimeout(() => {
        stop();
        reject(new Error(t('player.syncPlay.notConnected')));
      }, timeoutMs);
      stop = this.socket.onOpen(() => {
        window.clearTimeout(timer);
        // onOpen may call back before it has returned the way to stop it.
        queueMicrotask(() => stop());
        resolve();
      });
    });
  }

  /** Creates a group, open to everyone or, with `invite`, only shown to the creator and the users invited. */
  async createGroup(name: string, invite?: { creatorId: string; userIds: string[] }) {
    await this.connected();
    this.claimPlayback();
    this.clock.start();
    await this.api.post('/SyncPlay/New', { GroupName: invite ? inviteName(name, invite.creatorId, invite.userIds) : name });
  }

  async joinGroup(groupId: string) {
    await this.connected();
    // Remembered now, so a connection that drops before the server's answer joins again when back.
    storeGroup(groupId);
    this.claimPlayback();
    this.clock.start();
    await this.api.post('/SyncPlay/Join', { GroupId: groupId });
  }

  async leaveGroup() {
    await this.api.post('/SyncPlay/Leave');
  }

  private clearGroup() {
    storeGroup(null);
    this.queue = null;
    this.clock.stop();
    this.releaseVideo();
    this.update(EMPTY);
  }

  private async refreshGroup() {
    const id = this.snapshot.group?.GroupId;
    if (!id) return;
    try {
      const group = fromServer(await this.api.get<SyncPlayGroup>(`/SyncPlay/${id}`));
      if (this.snapshot.group?.GroupId === id) this.update({ group });
    } catch {
      /* ignore */
    }
  }

  private handleUpdate(u: GroupUpdate, direct: boolean) {
    switch (u.Type) {
      case 'GroupJoined': {
        const group = fromServer(u.Data as SyncPlayGroup);
        storeGroup(group.GroupId);
        this.queue = null;
        this.clock.start();
        this.update({ group, hasQueue: false, following: true, playlistItemId: null });
        break;
      }
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
          this.onNotice?.({ type: 'error', message: t('player.syncPlay.groupGone') });
          this.clearGroup();
        } else storeGroup(null);
        break;
      case 'LibraryAccessDenied':
        this.onNotice?.({ type: 'error', message: t('player.syncPlay.noAccess') });
        break;
      case 'StateUpdate': {
        const state = (u.Data as { State?: SyncPlayGroup['State'] })?.State;
        if (state && this.snapshot.group) this.update({ group: { ...this.snapshot.group, State: state } });
        break;
      }
      case 'PlayQueue':
        this.handleQueue(u.Data as QueueUpdate, direct);
        break;
    }
  }

  // ---- Queue ---------------------------------------------------------------

  private currentQueueItem(): QueueItem | null {
    const q = this.queue;
    return q && q.PlayingItemIndex >= 0 ? (q.Playlist[q.PlayingItemIndex] ?? null) : null;
  }

  private handleQueue(q: QueueUpdate, direct: boolean) {
    if (!this.inGroup) return;
    this.queue = q;
    const current = this.currentQueueItem();
    this.update({ hasQueue: Boolean(current) });
    if (!current || !this.snapshot.following) return;
    this.onQueue?.(this.queueState());
    if (!['NewPlaylist', 'SetCurrentItem', 'NextItem', 'PreviousItem'].includes(q.Reason)) return;
    // Already on this entry (e.g. the server re-sent the queue): nothing to open.
    if (this.follower?.playlistItemId === current.PlaylistItemId) return;
    if (!this.playsAlong(direct)) return;
    this.open(current, q);
  }

  private open(current: QueueItem, q: QueueUpdate) {
    let start = q.StartPositionTicks;
    if (q.IsPlaying) start += Math.max(0, this.clock.now() - parseTime(q.LastUpdate)) * TICKS_PER_MS;
    this.onOpen?.({
      itemId: current.ItemId,
      playlistItemId: current.PlaylistItemId,
      startPositionTicks: Math.max(0, Math.round(start)),
      queue: q.Playlist.map((p) => p.ItemId),
      index: q.PlayingItemIndex,
    });
  }

  /** Start something new for the whole group. */
  async setQueue(itemIds: string[], startIndex: number, startPositionTicks: number) {
    this.claimPlayback();
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
    this.claimPlayback();
    window.clearTimeout(this.detachTimer);
    this.update({ following: true });
    void this.api.post('/SyncPlay/SetIgnoreWait', { IgnoreWait: false }).catch(() => {});
    this.open(current, this.queue);
  }

  /** The group's queue, in the music player's terms. */
  queueState(): SyncPlayQueueState {
    const q = this.queue;
    return {
      queue: q?.Playlist.map((p) => p.ItemId) ?? [],
      index: q?.PlayingItemIndex ?? 0,
      repeat: q?.RepeatMode === 'RepeatOne' ? 'one' : q?.RepeatMode === 'RepeatAll' ? 'all' : 'off',
      shuffled: q?.ShuffleMode === 'Shuffle',
    };
  }

  /** Move the group on to the next queue entry (round to the start when repeating it all). Returns false when there is none. */
  requestNext(): boolean {
    const q = this.queue;
    const playlistItemId = this.follower?.playlistItemId;
    if (!q || !playlistItemId) return false;
    if (q.PlayingItemIndex >= q.Playlist.length - 1 && q.RepeatMode !== 'RepeatAll') return false;
    void this.api.post('/SyncPlay/NextItem', { PlaylistItemId: playlistItemId }).catch(() => {});
    return true;
  }

  /** Move the group back to the previous queue entry. Returns false when there is none. */
  requestPrevious(): boolean {
    const q = this.queue;
    const playlistItemId = this.follower?.playlistItemId;
    if (!q || !playlistItemId || q.PlayingItemIndex <= 0) return false;
    void this.api.post('/SyncPlay/PreviousItem', { PlaylistItemId: playlistItemId }).catch(() => {});
    return true;
  }

  /** Move the group to another entry of its queue. */
  jumpTo(index: number) {
    const entry = this.queue?.Playlist[index];
    if (entry) void this.api.post('/SyncPlay/SetPlaylistItem', { PlaylistItemId: entry.PlaylistItemId }).catch(() => {});
  }

  /** Repeat nothing, the whole queue, or the entry playing. */
  setRepeat(mode: 'off' | 'all' | 'one') {
    const Mode = mode === 'one' ? 'RepeatOne' : mode === 'all' ? 'RepeatAll' : 'RepeatNone';
    void this.api.post('/SyncPlay/SetRepeatMode', { Mode }).catch(() => {});
  }

  setShuffle(on: boolean) {
    void this.api.post('/SyncPlay/SetShuffleMode', { Mode: on ? 'Shuffle' : 'Sorted' }).catch(() => {});
  }

  /** Take an entry out of the group's queue. */
  remove(index: number) {
    const entry = this.queue?.Playlist[index];
    if (entry) void this.api.post('/SyncPlay/RemoveFromPlaylist', { PlaylistItemIds: [entry.PlaylistItemId] }).catch(() => {});
  }

  /** Play the current entry again from the start, for everyone (repeating one song). */
  restart() {
    void this.api
      .post('/SyncPlay/Seek', { PositionTicks: 0 })
      .then(() => this.api.post('/SyncPlay/Unpause'))
      .catch(() => {});
  }

  /** Add to the group's queue, at the end or right after what is playing. */
  enqueue(itemIds: string[], next = false) {
    void this.api.post('/SyncPlay/Queue', { ItemIds: itemIds, Mode: next ? 'QueueNext' : 'Queue' }).catch(() => {});
  }

  // ---- Local player --------------------------------------------------------

  /** Called by the video or music player when it starts on a group item. Returns the matching detach. */
  attach(video: HTMLMediaElement, playlistItemId: string): () => void {
    window.clearTimeout(this.detachTimer);
    this.releaseVideo();
    const follower = new SyncPlayFollower(this.api, this.clock, video, playlistItemId);
    this.follower = follower;
    this.update({ following: true, playlistItemId });

    return () => {
      if (this.follower !== follower) return;
      this.releaseVideo();
      this.update({ playlistItemId: null });
      // Moving on to the next item re-attaches right away. Otherwise the player was closed: tell the
      // server not to hold the group up waiting for this browser.
      this.detachTimer = window.setTimeout(() => {
        if (this.follower || !this.inGroup) return;
        this.update({ following: false });
        void this.api.post('/SyncPlay/SetIgnoreWait', { IgnoreWait: true }).catch(() => {});
      }, 800);
    };
  }

  /** The player is loading a new stream for the same item (see SyncPlayFollower.reloading). */
  reloading() {
    this.follower?.reloading();
  }

  private releaseVideo() {
    this.follower?.dispose();
    this.follower = null;
  }

  private handleCommand(c: SyncCommand) {
    const follower = this.follower;
    if (c.Command === 'Stop') {
      // Also sent when joining an idle group, when there is nothing to stop.
      if (follower && this.snapshot.following) this.onStop?.();
      return;
    }
    if (follower && normId(c.PlaylistItemId) === normId(follower.playlistItemId)) follower.command(c);
  }
}
