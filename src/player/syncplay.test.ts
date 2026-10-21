import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JellyfinApi } from '@/api/client';
import type { JellyfinSocket } from '@/realtime/socket';
import { SyncPlayManager, type SyncPlayGroup, type SyncPlayNotice, type SyncPlayOpenRequest } from './syncplay';
import { inviteName } from './syncplayInviteList';

/** A socket that only remembers who listens, so the test can play the server. Open unless told otherwise. */
function fakeSocket(isOpen = true) {
  const handlers = new Map<string, (data: unknown) => void>();
  const open = new Set<() => void>();
  return {
    socket: {
      on: (type: string, handler: (data: unknown) => void) => {
        handlers.set(type, handler);
        return () => handlers.delete(type);
      },
      onOpen: (handler: () => void) => {
        open.add(handler);
        if (isOpen) handler();
        return () => open.delete(handler);
      },
    } as unknown as JellyfinSocket,
    update: (Type: string, Data?: unknown) => handlers.get('SyncPlayGroupUpdate')?.({ GroupId: 'g1', Type, Data }),
    connect: () => {
      isOpen = true;
      [...open].forEach((h) => h());
    },
    listening: () => handlers.size,
  };
}

const group: SyncPlayGroup = { GroupId: 'g1', GroupName: 'Movie night', State: 'Idle', Participants: ['ann'] };
const queue = (patch: Record<string, unknown> = {}) => ({
  Reason: 'NewPlaylist',
  LastUpdate: '2026-10-11T18:00:00.0000000Z',
  Playlist: [
    { ItemId: 'item-1', PlaylistItemId: 'p1' },
    { ItemId: 'item-2', PlaylistItemId: 'p2' },
  ],
  PlayingItemIndex: 0,
  StartPositionTicks: 50_000_000,
  IsPlaying: false,
  ...patch,
});

let post: ReturnType<typeof vi.fn>;
let get: ReturnType<typeof vi.fn>;
let server: ReturnType<typeof fakeSocket>;
let manager: SyncPlayManager;
let opened: SyncPlayOpenRequest[];
let notices: SyncPlayNotice[];

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  localStorage.clear();
  post = vi.fn().mockResolvedValue(undefined);
  // The clock check and the group lookup both go through get(); neither answer matters here.
  get = vi.fn().mockResolvedValue({ ...group, Participants: ['ann', 'bob'] });
  server = fakeSocket();
  manager = new SyncPlayManager({ post, get } as unknown as JellyfinApi, server.socket);
  opened = [];
  notices = [];
  manager.onOpen = (r) => opened.push(r);
  manager.onNotice = (n) => notices.push(n);
});

afterEach(() => {
  manager.dispose();
  vi.useRealTimers();
});

describe('SyncPlayManager: groups', () => {
  it('starts outside a group', () => {
    expect(manager.inGroup).toBe(false);
    expect(manager.getSnapshot()).toEqual({ group: null, hasQueue: false, following: false, playlistItemId: null });
  });

  it('asks the server to create and to join a group', async () => {
    await manager.createGroup('Movie night');
    expect(post).toHaveBeenCalledWith('/SyncPlay/New', { GroupName: 'Movie night' });
    await manager.joinGroup('g1');
    expect(post).toHaveBeenCalledWith('/SyncPlay/Join', { GroupId: 'g1' });
  });

  it('writes who is invited into the name of an invite-only group', async () => {
    await manager.createGroup('Movie night', { creatorId: 'aaaaaaaa-1', userIds: ['bbbbbbbb-2'] });
    expect(post).toHaveBeenCalledWith('/SyncPlay/New', { GroupName: inviteName('Movie night', 'aaaaaaaa-1', ['bbbbbbbb-2']) });
  });

  it('shows the plain name of an invite-only group, with who it is for', async () => {
    const invited = { ...group, GroupName: inviteName('Movie night', 'aaaaaaaa', ['bbbbbbbb']) };
    get.mockResolvedValueOnce([invited, { ...group, GroupId: 'g2' }]);
    const groups = await manager.listGroups();
    expect(groups.map((g) => [g.GroupName, g.Invite])).toEqual([
      ['Movie night', { creator: 'aaaaaaaa', invited: ['bbbbbbbb'] }],
      ['Movie night', null],
    ]);
    server.update('GroupJoined', invited);
    expect(manager.getSnapshot().group).toMatchObject({ GroupName: 'Movie night', Invite: { creator: 'aaaaaaaa' } });
  });

  it('is in the group once the server confirms, follows it, and remembers it for a reload', () => {
    const listener = vi.fn();
    manager.subscribe(listener);
    server.update('GroupJoined', group);
    expect(manager.inGroup).toBe(true);
    expect(manager.getSnapshot()).toMatchObject({ group, following: true, hasQueue: false });
    expect(listener).toHaveBeenCalled();
    expect(sessionStorage.getItem('jellyfied.syncPlayGroup')).toBe('g1');
  });

  it('joins the remembered group again when the connection opens', async () => {
    manager.dispose();
    server = fakeSocket(false);
    manager = new SyncPlayManager({ post, get } as unknown as JellyfinApi, server.socket);
    sessionStorage.setItem('jellyfied.syncPlayGroup', 'g1');
    server.connect();
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith('/SyncPlay/Join', { GroupId: 'g1' }));
  });

  it('waits for the live connection before joining, and remembers the group from the start', async () => {
    manager.dispose();
    server = fakeSocket(false);
    manager = new SyncPlayManager({ post, get } as unknown as JellyfinApi, server.socket);
    const joining = manager.joinGroup('g1');
    await Promise.resolve();
    expect(post).not.toHaveBeenCalledWith('/SyncPlay/Join', expect.anything());
    server.connect();
    await joining;
    expect(post).toHaveBeenCalledWith('/SyncPlay/Join', { GroupId: 'g1' });
    expect(sessionStorage.getItem('jellyfied.syncPlayGroup')).toBe('g1');
  });

  it('says so when the live connection does not come, instead of joining a group it would not hear about', async () => {
    manager.dispose();
    server = fakeSocket(false);
    manager = new SyncPlayManager({ post, get } as unknown as JellyfinApi, server.socket);
    const joining = manager.joinGroup('g1');
    const failed = expect(joining).rejects.toThrow(/live updates/);
    await vi.advanceTimersByTimeAsync(15_000);
    await failed;
    expect(post).not.toHaveBeenCalledWith('/SyncPlay/Join', expect.anything());
  });

  it('reports who joins and leaves, and refreshes the member list', async () => {
    server.update('GroupJoined', group);
    server.update('UserJoined', 'bob');
    server.update('UserLeft', 'ann');
    expect(notices).toEqual([
      { type: 'joined', user: 'bob' },
      { type: 'left', user: 'ann' },
    ]);
    await vi.waitFor(() => expect(manager.getSnapshot().group?.Participants).toEqual(['ann', 'bob']));
    expect(get).toHaveBeenCalledWith('/SyncPlay/g1');
  });

  it('follows the group’s state', () => {
    server.update('GroupJoined', group);
    server.update('StateUpdate', { State: 'Playing' });
    expect(manager.getSnapshot().group?.State).toBe('Playing');
  });

  it('is out again after leaving, and forgets the group', () => {
    server.update('GroupJoined', group);
    server.update('GroupLeft');
    expect(manager.inGroup).toBe(false);
    expect(manager.getSnapshot().group).toBeNull();
    expect(sessionStorage.getItem('jellyfied.syncPlayGroup')).toBeNull();
  });

  it('says so when the group it was in is gone, but stays quiet about a remembered one', () => {
    sessionStorage.setItem('jellyfied.syncPlayGroup', 'old');
    server.update('GroupDoesNotExist');
    expect(notices).toEqual([]);
    expect(sessionStorage.getItem('jellyfied.syncPlayGroup')).toBeNull();

    server.update('GroupJoined', group);
    server.update('GroupDoesNotExist');
    expect(notices).toEqual([{ type: 'error', message: 'That SyncPlay group no longer exists.' }]);
    expect(manager.inGroup).toBe(false);
  });

  it('leaves the group on the server and stops listening when disposed', () => {
    server.update('GroupJoined', group);
    manager.dispose();
    expect(post).toHaveBeenCalledWith('/SyncPlay/Leave');
    expect(server.listening()).toBe(0);
  });
});

describe('SyncPlayManager: queue', () => {
  it('ignores a queue while not in a group', () => {
    server.update('PlayQueue', queue());
    expect(opened).toEqual([]);
    expect(manager.getSnapshot().hasQueue).toBe(false);
  });

  it('opens the player on the group’s item, at the group’s position', () => {
    server.update('GroupJoined', group);
    server.update('PlayQueue', queue());
    expect(manager.getSnapshot().hasQueue).toBe(true);
    expect(opened).toEqual([
      { itemId: 'item-1', playlistItemId: 'p1', startPositionTicks: 50_000_000, queue: ['item-1', 'item-2'], index: 0 },
    ]);
  });

  it('adds the time that has passed since the update when the group is already playing', () => {
    vi.setSystemTime(new Date('2026-10-11T18:00:10Z'));
    server.update('GroupJoined', group);
    server.update('PlayQueue', queue({ IsPlaying: true }));
    // Ten seconds later than the 5 s the update named.
    expect(opened[0].startPositionTicks).toBe(150_000_000);
  });

  it('tells the music player about every change to the queue, in its terms', () => {
    const states: unknown[] = [];
    manager.onQueue = (q) => states.push(q);
    server.update('GroupJoined', group);
    server.update('PlayQueue', queue({ Reason: 'RepeatMode', RepeatMode: 'RepeatAll', ShuffleMode: 'Shuffle', PlayingItemIndex: 1 }));
    expect(states).toEqual([{ queue: ['item-1', 'item-2'], index: 1, repeat: 'all', shuffled: true }]);
  });

  it('sends repeat, shuffle and removing an entry to the group', () => {
    server.update('GroupJoined', group);
    server.update('PlayQueue', queue());
    manager.setRepeat('one');
    manager.setShuffle(true);
    manager.remove(1);
    expect(post).toHaveBeenCalledWith('/SyncPlay/SetRepeatMode', { Mode: 'RepeatOne' });
    expect(post).toHaveBeenCalledWith('/SyncPlay/SetShuffleMode', { Mode: 'Shuffle' });
    expect(post).toHaveBeenCalledWith('/SyncPlay/RemoveFromPlaylist', { PlaylistItemIds: ['p2'] });
  });

  it('moves past the last entry only when the whole queue repeats', () => {
    server.update('GroupJoined', group);
    server.update('PlayQueue', queue({ PlayingItemIndex: 1 }));
    manager.attach(document.createElement('audio'), 'p2');
    expect(manager.requestNext()).toBe(false);
    server.update('PlayQueue', queue({ Reason: 'RepeatMode', PlayingItemIndex: 1, RepeatMode: 'RepeatAll' }));
    expect(manager.requestNext()).toBe(true);
    expect(post).toHaveBeenCalledWith('/SyncPlay/NextItem', { PlaylistItemId: 'p2' });
  });

  it('does not open anything for queue changes that keep the current item', () => {
    server.update('GroupJoined', group);
    server.update('PlayQueue', queue({ Reason: 'RemoveItems' }));
    expect(opened).toEqual([]);
    expect(manager.getSnapshot().hasQueue).toBe(true);
  });

  it('has no queue when nothing is selected in it', () => {
    server.update('GroupJoined', group);
    server.update('PlayQueue', queue({ PlayingItemIndex: -1 }));
    expect(manager.getSnapshot().hasQueue).toBe(false);
    expect(opened).toEqual([]);
  });

  it('starts something new for the whole group', async () => {
    server.update('GroupJoined', group);
    await manager.setQueue(['a', 'b'], 1, 12.6);
    expect(post).toHaveBeenCalledWith('/SyncPlay/SetNewQueue', {
      PlayingQueue: ['a', 'b'],
      PlayingItemPosition: 1,
      StartPositionTicks: 13,
    });
  });

  it('cannot move on while the local player is not on a group item', () => {
    server.update('GroupJoined', group);
    server.update('PlayQueue', queue());
    expect(manager.requestNext()).toBe(false);
  });

  it('opens the player again for someone who had stopped locally', () => {
    server.update('GroupJoined', group);
    server.update('PlayQueue', queue());
    opened.length = 0;
    manager.rejoinPlayback();
    expect(opened).toHaveLength(1);
    expect(post).toHaveBeenCalledWith('/SyncPlay/SetIgnoreWait', { IgnoreWait: false });
  });
});

describe('SyncPlayManager: tabs of one browser', () => {
  /** Two tabs: one session on the server, which sends each message to only one of them. */
  let tabs: { manager: SyncPlayManager; server: ReturnType<typeof fakeSocket>; opened: SyncPlayOpenRequest[] }[];
  const settle = () => new Promise((r) => setTimeout(r, 20));

  beforeEach(() => {
    vi.useRealTimers();
    manager.dispose();
    tabs = [0, 1].map(() => {
      const tabServer = fakeSocket();
      const tab = new SyncPlayManager({ post, get } as unknown as JellyfinApi, tabServer.socket);
      const tabOpened: SyncPlayOpenRequest[] = [];
      tab.onOpen = (r) => tabOpened.push(r);
      return { manager: tab, server: tabServer, opened: tabOpened };
    });
  });

  afterEach(() => tabs.forEach((t) => t.manager.dispose()));

  it('are all in the group, whichever of them the server told', async () => {
    await tabs[0].manager.createGroup('Movie night');
    tabs[1].server.update('GroupJoined', group);
    await settle();
    expect(tabs.map((t) => t.manager.getSnapshot().group?.GroupName)).toEqual(['Movie night', 'Movie night']);
  });

  it('play along in the tab where SyncPlay was used, whichever of them the server told', async () => {
    await tabs[0].manager.createGroup('Movie night');
    tabs[1].server.update('GroupJoined', group);
    tabs[1].server.update('PlayQueue', queue());
    await settle();
    expect(tabs[0].opened.map((r) => r.itemId)).toEqual(['item-1']);
    expect(tabs[1].opened).toEqual([]);
  });

  it('lets a tab opened later know about the group', async () => {
    tabs[0].server.update('GroupJoined', group);
    await settle();
    const later = new SyncPlayManager({ post, get } as unknown as JellyfinApi, fakeSocket().socket);
    await settle();
    expect(later.getSnapshot()).toMatchObject({ group: { GroupName: 'Movie night' }, following: false });
    later.dispose();
  });
});
