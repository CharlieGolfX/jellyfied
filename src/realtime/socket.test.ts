import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JellyfinApi } from '@/api/client';
import { JellyfinSocket } from './socket';

/** Stands in for the browser's WebSocket and records what the client does with it. */
class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
  receive(message: unknown) {
    this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) });
  }
  drop() {
    this.readyState = 3;
    this.onclose?.();
  }
}

const api = { serverUrl: '/jellyfin', accessToken: 'tok', deviceId: 'dev-1' } as unknown as JellyfinApi;
const last = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('JellyfinSocket', () => {
  it('connects to the server’s socket with the token and the device id', () => {
    const socket = new JellyfinSocket(api);
    const url = new URL(last().url);
    expect(url.protocol).toBe('ws:');
    expect(url.pathname).toBe('/jellyfin/socket');
    expect(url.searchParams.get('api_key')).toBe('tok');
    expect(url.searchParams.get('deviceId')).toBe('dev-1');
    socket.close();
  });

  it('uses a secure socket for a server behind https', () => {
    const socket = new JellyfinSocket({ ...api, serverUrl: 'https://media.example.com/jf' } as unknown as JellyfinApi);
    expect(last().url.startsWith('wss://media.example.com/jf/socket?')).toBe(true);
    socket.close();
  });

  it('hands messages to the subscribers of their type, and stops after unsubscribing', () => {
    const socket = new JellyfinSocket(api);
    const play = vi.fn();
    const other = vi.fn();
    const off = socket.on('Play', play);
    socket.on('Playstate', other);
    last().open();
    last().receive({ MessageType: 'Play', Data: { ItemIds: ['a'] } });
    expect(play).toHaveBeenCalledWith({ ItemIds: ['a'] });
    expect(other).not.toHaveBeenCalled();
    off();
    last().receive({ MessageType: 'Play', Data: {} });
    expect(play).toHaveBeenCalledTimes(1);
    socket.close();
  });

  it('survives a subscriber that throws and messages that are not JSON', () => {
    const socket = new JellyfinSocket(api);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const second = vi.fn();
    socket.on('Play', () => {
      throw new Error('boom');
    });
    socket.on('Play', second);
    last().open();
    last().receive('not json');
    last().receive({ MessageType: 'Play' });
    expect(second).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalled();
    socket.close();
  });

  it('answers the server’s keep-alive request, at half the timeout it names', () => {
    const socket = new JellyfinSocket(api);
    last().open();
    last().receive({ MessageType: 'ForceKeepAlive', Data: 60 });
    expect(last().sent).toEqual([JSON.stringify({ MessageType: 'KeepAlive' })]);
    vi.advanceTimersByTime(30_000);
    expect(last().sent).toHaveLength(2);
    vi.advanceTimersByTime(60_000);
    expect(last().sent).toHaveLength(4);
    socket.close();
  });

  it('does not send while the connection is not open', () => {
    const socket = new JellyfinSocket(api);
    socket.send('KeepAlive');
    expect(last().sent).toEqual([]);
    socket.close();
  });

  it('reconnects after a drop, waiting longer each time, and starts over once connected', () => {
    const socket = new JellyfinSocket(api);
    last().drop();
    vi.advanceTimersByTime(999);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);

    last().drop();
    vi.advanceTimersByTime(1999);
    expect(FakeWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(3);

    last().open();
    last().drop();
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(4);
    socket.close();
  });

  it('never waits longer than half a minute between attempts', () => {
    const socket = new JellyfinSocket(api);
    for (let i = 0; i < 10; i++) {
      last().drop();
      vi.advanceTimersByTime(30_000);
    }
    expect(FakeWebSocket.instances).toHaveLength(11);
    socket.close();
  });

  it('tells its open listeners about every connection, and right away when already connected', () => {
    const socket = new JellyfinSocket(api);
    const early = vi.fn();
    socket.onOpen(early);
    expect(early).not.toHaveBeenCalled();
    last().open();
    expect(early).toHaveBeenCalledTimes(1);

    const late = vi.fn();
    socket.onOpen(late);
    expect(late).toHaveBeenCalledTimes(1);

    last().drop();
    vi.advanceTimersByTime(1000);
    last().open();
    expect(early).toHaveBeenCalledTimes(2);
    socket.close();
  });

  it('stays closed once closed', () => {
    const socket = new JellyfinSocket(api);
    const ws = last();
    ws.open();
    socket.close();
    expect(ws.closed).toBe(true);
    ws.drop();
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(socket.isOpen).toBe(false);
  });
});
