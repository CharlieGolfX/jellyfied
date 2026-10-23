import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BaseItemDto } from '@/api/types';
import { renderHook, stubMediaElements } from '@/test/renderHook';

const m = vi.hoisted(() => ({
  api: null as unknown,
  castTarget: null as { sessionId: string; deviceName: string } | null,
  sendRemotePlay: vi.fn(() => Promise.resolve()),
  chromecast: { status: 'off' },
  castPlay: vi.fn(() => Promise.resolve()),
  ids: 0,
}));

vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ api: m.api }) }));
vi.mock('@/api/device', () => ({ generateId: () => `session-${++m.ids}` }));
vi.mock('./castTarget', () => ({ getCastTarget: () => m.castTarget, sendRemotePlay: m.sendRemotePlay }));
vi.mock('./chromecast', () => ({ getChromecast: () => m.chromecast, castPlay: m.castPlay }));

import { AudioPlayerProvider, useAudioPlayer, useAudioTime } from './AudioPlayerProvider';

const track = (Id: string, patch: Partial<BaseItemDto> = {}) =>
  ({ Id, Name: `Song ${Id}`, Type: 'Audio', MediaType: 'Audio', RunTimeTicks: 1_800_000_000, ...patch }) as BaseItemDto;
const tracks = ['a', 'b', 'c'].map((id) => track(id));

const request = vi.fn((_method: string, _path: string, _opts?: unknown) => Promise.resolve());
const api = {
  userId: 'user-1',
  deviceId: 'device-1',
  url: (path: string, query: Record<string, unknown>) => `${path}?session=${String(query.PlaySessionId)}`,
  imageUrl: () => '/image.jpg',
  request,
};
/** The reports sent to the server, as "path item" pairs. */
const reports = () => request.mock.calls.map(([, path, opts]) => `${path} ${(opts as { body: { ItemId: string } }).body.ItemId}`);

/** The audio element the player made: the only one, as it is created once. */
let audio: HTMLAudioElement;
const fire = (type: string) => act(() => void audio.dispatchEvent(new Event(type)));

function start() {
  const hook = renderHook(() => ({ ...useAudioPlayer(), currentTime: useAudioTime() }), {
    wrapper: (children) => <AudioPlayerProvider>{children}</AudioPlayerProvider>,
  });
  return hook;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  stubMediaElements();
  m.api = api;
  m.castTarget = null;
  m.chromecast = { status: 'off' };
  m.ids = 0;
  const RealAudio = window.Audio;
  // The player makes its one audio element itself; keep hold of it.
  vi.stubGlobal('Audio', function Audio() {
    audio = new RealAudio();
    return audio;
  });
});

describe('playing a queue', () => {
  it('loads the chosen track from the server and reports that it started', () => {
    const { result } = start();
    act(() => result.current.play(tracks, 1));
    expect(result.current.current?.Id).toBe('b');
    expect(audio.src).toContain('/Audio/b/universal?session=session-1');
    expect(result.current.duration).toBe(180);
    expect(result.current.isLoading).toBe(true);
    expect(reports()).toEqual(['/Sessions/Playing b']);
    fire('playing');
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it('moves on when a track ends, and reports the one that stopped', () => {
    const { result } = start();
    act(() => result.current.play(tracks));
    fire('ended');
    expect(result.current.current?.Id).toBe('b');
    expect(reports()).toEqual(['/Sessions/Playing a', '/Sessions/Playing/Stopped a', '/Sessions/Playing b']);
  });

  it('stops after the last track', () => {
    const { result } = start();
    act(() => result.current.play(tracks, 2));
    fire('playing');
    fire('ended');
    expect(result.current.current?.Id).toBe('c');
    expect(result.current.isPlaying).toBe(false);
    expect(reports().at(-1)).toBe('/Sessions/Playing/Stopped c');
  });

  it('starts over after the last track when repeating all, and replays one track when repeating one', () => {
    const { result } = start();
    act(() => result.current.play(tracks, 2));
    act(() => result.current.cycleRepeat());
    expect(result.current.repeat).toBe('all');
    fire('ended');
    expect(result.current.current?.Id).toBe('a');

    act(() => result.current.cycleRepeat());
    expect(result.current.repeat).toBe('one');
    audio.currentTime = 42;
    fire('ended');
    expect(result.current.current?.Id).toBe('a');
    expect(audio.currentTime).toBe(0);
    act(() => result.current.cycleRepeat());
    expect(result.current.repeat).toBe('off');
  });

  it('restarts the track when it is played again, instead of loading it twice', () => {
    const { result } = start();
    act(() => result.current.play(tracks));
    audio.currentTime = 30;
    act(() => result.current.play([track('a'), track('z')]));
    expect(audio.currentTime).toBe(0);
    expect(reports()).toEqual(['/Sessions/Playing a']);
  });

  it('does nothing with an empty list', () => {
    const { result } = start();
    act(() => result.current.play([]));
    expect(result.current.current).toBeNull();
  });
});

describe('controls', () => {
  it('goes to the next and previous track, and back to the start of a track that is under way', () => {
    const { result } = start();
    act(() => result.current.play(tracks));
    act(() => result.current.next());
    expect(result.current.current?.Id).toBe('b');
    audio.currentTime = 10;
    act(() => result.current.previous());
    expect(result.current.current?.Id).toBe('b');
    expect(audio.currentTime).toBe(0);
    act(() => result.current.previous());
    expect(result.current.current?.Id).toBe('a');
  });

  it('stays on the last track unless repeating all', () => {
    const { result } = start();
    act(() => result.current.play(tracks, 2));
    act(() => result.current.next());
    expect(result.current.current?.Id).toBe('c');
    act(() => result.current.cycleRepeat());
    act(() => result.current.next());
    expect(result.current.current?.Id).toBe('a');
  });

  it('pauses, resumes and seeks', () => {
    const { result } = start();
    act(() => result.current.play(tracks));
    fire('playing');
    act(() => result.current.toggle());
    expect(audio.paused).toBe(true);
    fire('pause');
    expect(result.current.isPlaying).toBe(false);
    act(() => result.current.toggle());
    expect(audio.paused).toBe(false);
    act(() => result.current.seek(-5));
    expect(result.current.currentTime).toBe(0);
    act(() => result.current.seek(61));
    expect(result.current.currentTime).toBe(61);
  });

  it('reports pausing and resuming to the server', () => {
    const { result } = start();
    act(() => result.current.play(tracks));
    request.mockClear();
    fire('pause');
    fire('play');
    expect(request.mock.calls.map(([, path, opts]) => [path, (opts as { body: { EventName: string } }).body.EventName])).toEqual([
      ['/Sessions/Playing/Progress', 'pause'],
      ['/Sessions/Playing/Progress', 'unpause'],
    ]);
  });

  it('keeps the volume for next time, and unmutes when it is changed', () => {
    const { result } = start();
    act(() => result.current.toggleMute());
    expect(audio.muted).toBe(true);
    act(() => result.current.setVolume(0.4));
    expect(audio.volume).toBe(0.4);
    expect(audio.muted).toBe(false);
    expect(localStorage.getItem('jellyfied.volume')).toBe('0.4');
    act(() => result.current.setVolume(7));
    expect(result.current.volume).toBe(1);
  });

  it('starts with the volume that was kept', () => {
    localStorage.setItem('jellyfied.volume', '0.25');
    expect(start().result.current.volume).toBe(0.25);
  });
});

describe('changing the queue', () => {
  it('adds tracks at the end, or right after the one that is playing', () => {
    const { result } = start();
    act(() => result.current.play(tracks, 1));
    act(() => result.current.enqueue([track('y')]));
    act(() => result.current.playNext([track('x')]));
    expect(result.current.queue.map((t) => t.Id)).toEqual(['a', 'b', 'x', 'c', 'y']);
    expect(result.current.current?.Id).toBe('b');
  });

  it('starts playing when tracks are queued next with nothing playing', () => {
    const { result } = start();
    act(() => result.current.playNext([track('x')]));
    expect(result.current.current?.Id).toBe('x');
  });

  it('keeps playing the same track when one before it is removed, and moves on when it is the one removed', () => {
    const { result } = start();
    act(() => result.current.play(tracks, 1));
    act(() => result.current.removeAt(0));
    expect(result.current.current?.Id).toBe('b');
    expect(result.current.index).toBe(0);
    act(() => result.current.removeAt(0));
    expect(result.current.current?.Id).toBe('c');
    act(() => result.current.removeAt(0));
    expect(result.current.current).toBeNull();
    expect(result.current.index).toBe(0);
    // With the queue emptied that way, what is added next still plays.
    act(() => result.current.enqueue([track('d')]));
    expect(result.current.current?.Id).toBe('d');
  });

  it('jumps to a track in the queue', () => {
    const { result } = start();
    act(() => result.current.play(tracks));
    act(() => result.current.jumpTo(2));
    expect(result.current.current?.Id).toBe('c');
  });

  it('shuffles what is still to come and leaves what was played where it is', () => {
    const many = Array.from({ length: 40 }, (_, i) => track(`t${i}`));
    const { result } = start();
    act(() => result.current.play(many, 2));
    act(() => result.current.shuffleQueue());
    const ids = result.current.queue.map((t) => t.Id);
    expect(ids.slice(0, 3)).toEqual(['t0', 't1', 't2']);
    expect([...ids].sort()).toEqual(many.map((t) => t.Id).sort());
    expect(ids).not.toEqual(many.map((t) => t.Id));
  });

  it('empties the queue on stop and unloads the track', () => {
    const { result } = start();
    act(() => result.current.play(tracks));
    act(() => result.current.stop());
    expect(result.current.queue).toEqual([]);
    expect(audio.getAttribute('src')).toBeNull();
    expect(reports().at(-1)).toBe('/Sessions/Playing/Stopped a');
  });

  it('stops when the user signs out', () => {
    const { result, rerender } = start();
    act(() => result.current.play(tracks));
    m.api = null;
    rerender();
    expect(result.current.queue).toEqual([]);
  });
});

describe('while playing on another device', () => {
  it('sends music to a connected Chromecast instead of playing it here', () => {
    m.chromecast = { status: 'connected' };
    const { result } = start();
    act(() => result.current.play(tracks, 1));
    act(() => result.current.enqueue([track('y')]));
    expect(result.current.queue).toEqual([]);
    expect(m.castPlay).toHaveBeenNthCalledWith(1, expect.anything(), tracks, { shuffle: false, queue: undefined, startIndex: 1 });
    expect(m.castPlay).toHaveBeenNthCalledWith(2, expect.anything(), [track('y')], { shuffle: false, queue: 'PlayLast', startIndex: 0 });
  });

  it('sends music to the Jellyfin app chosen with "Play on"', () => {
    m.castTarget = { sessionId: 's1', deviceName: 'Living room' };
    const { result } = start();
    act(() => result.current.playNext(tracks));
    expect(result.current.queue).toEqual([]);
    expect(m.sendRemotePlay).toHaveBeenCalledWith(api, m.castTarget, ['a', 'b', 'c'], { command: 'PlayNext', startIndex: 0 });
  });
});
