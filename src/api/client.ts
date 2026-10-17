import { APP_NAME, APP_VERSION } from '@/config';
import { getDeviceId, getDeviceName } from './device';
import type { ImageType } from './types';
import { t } from '@/i18n';

export type QueryValue = string | number | boolean | null | undefined | (string | number)[];
export type Query = Record<string, QueryValue>;

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  /** Send the body as-is with this content type instead of JSON. */
  rawBody?: { data: BodyInit; contentType: string };
  signal?: AbortSignal;
  /** Expected response format. Defaults to JSON (or undefined for empty responses). */
  responseType?: 'json' | 'text';
  keepalive?: boolean;
}

function headerSafe(value: string): string {
  // Header values must be ISO-8859-1; strip anything else and quotes.
  return value.replace(/[^\x20-\x7e]/g, '').replace(/"/g, "'");
}

export function buildQuery(query?: Query): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      params.set(key, value.join(','));
    } else {
      params.set(key, String(value));
    }
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export interface ImageOptions {
  tag?: string | null;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  index?: number;
}

export class JellyfinApi {
  readonly serverUrl: string;
  readonly accessToken?: string;
  readonly userId?: string;
  /**
   * The app name requests give. Jellyfin files a session under app name and device, and takes the
   * name for the WebSocket from the sign-in, so this has to be the name the token was issued under.
   */
  clientName: string = APP_NAME;

  setClientName(name: string) {
    this.clientName = name;
  }
  /** Invoked when an authenticated request is rejected with 401. */
  onUnauthorized?: () => void;

  constructor(serverUrl: string, accessToken?: string, userId?: string, clientName?: string) {
    this.serverUrl = serverUrl.replace(/\/+$/, '');
    this.accessToken = accessToken;
    this.userId = userId;
    if (clientName) this.clientName = clientName;
  }

  get deviceId(): string {
    return getDeviceId();
  }

  authorizationHeader(): string {
    const parts = [
      `Client="${headerSafe(this.clientName)}"`,
      `Device="${headerSafe(getDeviceName())}"`,
      `DeviceId="${getDeviceId()}"`,
      `Version="${APP_VERSION}"`,
    ];
    if (this.accessToken) parts.push(`Token="${this.accessToken}"`);
    return `MediaBrowser ${parts.join(', ')}`;
  }

  /** Absolute URL for an API path. Adds the access token when `withAuth` is set (for media elements). */
  url(path: string, query?: Query, withAuth = false): string {
    const q: Query = { ...query };
    // "ApiKey": Jellyfin 12 ignores the older "api_key" unless its legacy authorization is turned on.
    if (withAuth && this.accessToken) q.ApiKey = this.accessToken;
    return `${this.serverUrl}${path.startsWith('/') ? path : `/${path}`}${buildQuery(q)}`;
  }

  imageUrl(itemId: string, type: ImageType = 'Primary', opts: ImageOptions = {}): string {
    const path = opts.index !== undefined ? `/Items/${itemId}/Images/${type}/${opts.index}` : `/Items/${itemId}/Images/${type}`;
    return this.url(path, {
      tag: opts.tag ?? undefined,
      maxWidth: opts.maxWidth,
      maxHeight: opts.maxHeight,
      quality: opts.quality ?? 90,
    });
  }

  userImageUrl(userId: string, tag?: string | null, size = 160): string {
    return this.url('/UserImage', { userId, tag: tag ?? undefined, maxWidth: size, quality: 90 });
  }

  async request<T = unknown>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: this.authorizationHeader(),
      Accept: opts.responseType === 'text' ? 'text/plain, */*' : 'application/json',
    };
    let body: BodyInit | undefined;
    if (opts.rawBody) {
      headers['Content-Type'] = opts.rawBody.contentType;
      body = opts.rawBody.data;
    } else if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }

    let response: Response;
    try {
      response = await fetch(this.url(path, opts.query), {
        method,
        headers,
        body,
        signal: opts.signal,
        keepalive: opts.keepalive,
        // Ahead of the artwork that is loading at the same time.
        priority: 'high',
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      throw new ApiError(0, t('api.client.unableToReachTheJellyfin'));
    }

    if (!response.ok) {
      if (response.status === 401 && this.accessToken) this.onUnauthorized?.();
      let message = response.statusText || t('api.client.requestFailed', { status: response.status });
      try {
        const text = await response.text();
        if (text) {
          try {
            const parsed = JSON.parse(text);
            message = parsed.title || parsed.detail || parsed.Message || message;
          } catch {
            if (text.length < 300) message = text;
          }
        }
      } catch {
        /* ignore */
      }
      if (response.status === 401) message = t('api.client.sessionExpired');
      if (response.status === 403) message = t('api.client.youDoNotHavePermission');
      throw new ApiError(response.status, message);
    }

    if (response.status === 204) return undefined as T;
    const text = await response.text();
    if (opts.responseType === 'text') return text as T;
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }

  get<T = unknown>(path: string, query?: Query, signal?: AbortSignal): Promise<T> {
    return this.request<T>('GET', path, { query, signal });
  }

  post<T = unknown>(path: string, body?: unknown, query?: Query): Promise<T> {
    return this.request<T>('POST', path, { body, query });
  }

  delete<T = unknown>(path: string, query?: Query): Promise<T> {
    return this.request<T>('DELETE', path, { query });
  }
}
