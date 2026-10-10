import type { JellyfinApi } from '@/api/client';

export interface SocketMessage<T = unknown> {
  MessageType: string;
  MessageId?: string;
  Data?: T;
}

type Handler = (data: unknown) => void;

/**
 * Jellyfin's WebSocket: the server uses it to push remote-control commands and SyncPlay updates.
 * Reconnects on its own, and answers the server's keep-alive requests.
 */
export class JellyfinSocket {
  private ws: WebSocket | null = null;
  private closed = false;
  private retry = 0;
  private retryTimer: number | undefined;
  private keepAliveTimer: number | undefined;
  private readonly handlers = new Map<string, Set<Handler>>();
  private readonly openHandlers = new Set<() => void>();
  private readonly api: JellyfinApi;

  constructor(api: JellyfinApi) {
    this.api = api;
    this.connect();
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private url(): string {
    // serverUrl may be a path such as "/jellyfin" (proxy mode) or an absolute address.
    const base = new URL(`${this.api.serverUrl}/socket`, window.location.href);
    base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    base.searchParams.set('api_key', this.api.accessToken ?? '');
    base.searchParams.set('deviceId', this.api.deviceId);
    return base.toString();
  }

  private connect() {
    if (this.closed) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.openHandlers.forEach((h) => h());
    };
    ws.onmessage = (event) => {
      let msg: SocketMessage;
      try {
        msg = JSON.parse(String(event.data)) as SocketMessage;
      } catch {
        return;
      }
      if (msg.MessageType === 'ForceKeepAlive') {
        this.startKeepAlive(Number(msg.Data) || 60);
        return;
      }
      if (msg.MessageType === 'KeepAlive') return;
      this.handlers.get(msg.MessageType)?.forEach((h) => {
        try {
          h(msg.Data);
        } catch (err) {
          console.error(`Error handling ${msg.MessageType}`, err);
        }
      });
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      window.clearInterval(this.keepAliveTimer);
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private scheduleReconnect() {
    if (this.closed) return;
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.retry++, 5));
    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => this.connect(), delay);
  }

  /** The server drops connections that stay silent for `timeoutSeconds`. */
  private startKeepAlive(timeoutSeconds: number) {
    window.clearInterval(this.keepAliveTimer);
    this.send('KeepAlive');
    this.keepAliveTimer = window.setInterval(() => this.send('KeepAlive'), Math.max(5, timeoutSeconds / 2) * 1000);
  }

  send(messageType: string, data?: unknown) {
    if (!this.isOpen) return;
    this.ws!.send(JSON.stringify(data === undefined ? { MessageType: messageType } : { MessageType: messageType, Data: data }));
  }

  /** Subscribe to one message type. Returns an unsubscribe function. */
  on<T = unknown>(messageType: string, handler: (data: T) => void): () => void {
    let set = this.handlers.get(messageType);
    if (!set) this.handlers.set(messageType, (set = new Set()));
    set.add(handler as Handler);
    return () => set.delete(handler as Handler);
  }

  /** Runs whenever the connection is (re)established, and right away if it already is. */
  onOpen(handler: () => void): () => void {
    this.openHandlers.add(handler);
    if (this.isOpen) handler();
    return () => this.openHandlers.delete(handler);
  }

  close() {
    this.closed = true;
    window.clearTimeout(this.retryTimer);
    window.clearInterval(this.keepAliveTimer);
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }
}
