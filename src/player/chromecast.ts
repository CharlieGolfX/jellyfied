import { useSyncExternalStore } from 'react';
import type { JellyfinApi } from '@/api/client';
import { isChromium } from '@/api/device';
import type { BaseItemDto } from '@/api/types';

/**
 * Chromecast, through Google's Cast SDK and Jellyfin's own receiver app (the one the official
 * Jellyfin clients cast to). The receiver is handed the server address and this session's access
 * token and then fetches and plays the media itself; this side only sends it commands and shows
 * what it reports back.
 */

const SDK_URL = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
const RECEIVER_APP_ID = 'F007D354';
const NAMESPACE = 'urn:x-cast:com.connectsdk';
/** Set while a cast session is open, so a reloaded page joins it again without being asked. */
const RESUME_KEY = 'jellyplex.chromecast';

// The parts of the Cast SDK used here (it has no bundled types and is loaded at run time).
interface CastSession {
  getCastDevice(): { friendlyName?: string };
  sendMessage(namespace: string, data: unknown): Promise<unknown>;
  addMessageListener(namespace: string, listener: (namespace: string, message: string) => void): void;
  getVolume(): number | null;
  setVolume(volume: number): Promise<unknown>;
  isMute(): boolean | null;
  setMute(mute: boolean): Promise<unknown>;
}
interface CastContext {
  setOptions(options: Record<string, unknown>): void;
  requestSession(): Promise<unknown>;
  getCurrentSession(): CastSession | null;
  endCurrentSession(stopCasting: boolean): void;
  addEventListener(type: string, handler: (event: { sessionState?: string }) => void): void;
}
interface CastWindow {
  __onGCastApiAvailable?: (available: boolean) => void;
  cast?: {
    framework: {
      CastContext: { getInstance(): CastContext };
      CastContextEventType: { SESSION_STATE_CHANGED: string };
      SessionState: Record<'SESSION_STARTED' | 'SESSION_RESUMED' | 'SESSION_ENDED' | 'SESSION_START_FAILED', string>;
    };
  };
  chrome?: { cast?: { AutoJoinPolicy: { ORIGIN_SCOPED: string } } };
}
const win = (): CastWindow => window as unknown as CastWindow;

export interface CastPlayState {
  PositionTicks?: number | null;
  IsPaused?: boolean;
  IsMuted?: boolean;
  VolumeLevel?: number | null;
}

export interface ChromecastState {
  /** 'off' until the Cast SDK has been asked for; 'unavailable' when it could not be loaded. */
  status: 'off' | 'loading' | 'unavailable' | 'ready' | 'connected';
  deviceName: string;
  /** What the Chromecast says it is playing. */
  item: BaseItemDto | null;
  playState: CastPlayState | null;
  /** When `playState` arrived, as an ISO time: the position is counted on from there. */
  reportedAt: string | null;
}

/** Chromecast only exists in Chromium browsers, and not in the ones on iPhone and iPad. */
export const chromecastSupported = typeof navigator !== 'undefined' && isChromium() && !/iPhone|iPad|iPod/.test(navigator.userAgent);

let state: ChromecastState = { status: 'off', deviceName: '', item: null, playState: null, reportedAt: null };
const listeners = new Set<() => void>();
let errorHandler: ((message: string) => void) | null = null;

function update(patch: Partial<ChromecastState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getChromecast(): ChromecastState {
  return state;
}

export function useChromecast(): ChromecastState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

/** Receives the errors the Chromecast reports (a file it can't play, a server it can't reach). */
export function onChromecastError(handler: ((message: string) => void) | null) {
  errorHandler = handler;
}

function remember(connected: boolean) {
  try {
    if (connected) sessionStorage.setItem(RESUME_KEY, '1');
    else sessionStorage.removeItem(RESUME_KEY);
  } catch {
    /* ignore */
  }
}

/** A message from the receiver: `{ type, data }`, where data is a Jellyfin session-style state. */
export function parseCastMessage(raw: string): { type: string; item?: BaseItemDto | null; playState?: CastPlayState } | null {
  try {
    const message = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
      type?: string;
      data?: { NowPlayingItem?: BaseItemDto | null; PlayState?: CastPlayState } | null;
    };
    if (!message || typeof message.type !== 'string') return null;
    return { type: message.type, item: message.data?.NowPlayingItem, playState: message.data?.PlayState ?? undefined };
  } catch {
    return null;
  }
}

function onMessage(_namespace: string, raw: string) {
  const message = parseCastMessage(raw);
  if (!message) return;
  if (message.type === 'playbackerror' || message.type === 'connectionerror') {
    errorHandler?.(
      message.type === 'connectionerror'
        ? 'The Chromecast could not reach the Jellyfin server. It needs an address it can open itself, not localhost.'
        : 'The Chromecast could not play this.',
    );
    return;
  }
  if (message.type === 'playbackstop') {
    update({ item: null, playState: null, reportedAt: null });
    return;
  }
  if (!message.playState && message.item === undefined) return;
  update({
    item: message.item === undefined ? state.item : message.item,
    playState: message.playState ?? state.playState,
    reportedAt: new Date().toISOString(),
  });
}

function onSession(connected: boolean) {
  const session = win().cast?.framework.CastContext.getInstance().getCurrentSession();
  if (connected && session) {
    session.addMessageListener(NAMESPACE, onMessage);
    remember(true);
    update({
      status: 'connected',
      deviceName: session.getCastDevice().friendlyName || 'Chromecast',
      item: null,
      playState: null,
      reportedAt: null,
    });
  } else {
    remember(false);
    update({ status: 'ready', deviceName: '', item: null, playState: null, reportedAt: null });
  }
}

let sdk: Promise<boolean> | null = null;

/** Loads Google's Cast SDK the first time it is needed. Resolves to false when that isn't possible. */
export function loadChromecast(): Promise<boolean> {
  if (!chromecastSupported) return Promise.resolve(false);
  sdk ??= new Promise<boolean>((resolve) => {
    update({ status: 'loading' });
    const fail = () => {
      update({ status: 'unavailable' });
      // Allow another attempt later (the network may have been down).
      sdk = null;
      resolve(false);
    };
    const timer = window.setTimeout(fail, 15_000);
    win().__onGCastApiAvailable = (available) => {
      window.clearTimeout(timer);
      const w = win();
      if (!available || !w.cast || !w.chrome?.cast) {
        fail();
        return;
      }
      const fw = w.cast.framework;
      const context = fw.CastContext.getInstance();
      context.setOptions({ receiverApplicationId: RECEIVER_APP_ID, autoJoinPolicy: w.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED });
      context.addEventListener(fw.CastContextEventType.SESSION_STATE_CHANGED, (event) => {
        if (event.sessionState === fw.SessionState.SESSION_STARTED || event.sessionState === fw.SessionState.SESSION_RESUMED)
          onSession(true);
        else if (event.sessionState === fw.SessionState.SESSION_ENDED) onSession(false);
      });
      update({ status: 'ready' });
      if (context.getCurrentSession()) onSession(true);
      resolve(true);
    };
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timer);
      fail();
    };
    document.head.appendChild(script);
  });
  return sdk;
}

/** Joins a cast session that was open before the page was reloaded. */
export function resumeChromecast() {
  try {
    if (chromecastSupported && sessionStorage.getItem(RESUME_KEY)) void loadChromecast();
  } catch {
    /* ignore */
  }
}

/**
 * Opens Chrome's device list and connects to the chosen Chromecast. Call it from a click.
 * Resolves to false when the user closed the list or casting isn't possible.
 */
export async function connectChromecast(): Promise<boolean> {
  if (!(await loadChromecast())) return false;
  try {
    await win().cast!.framework.CastContext.getInstance().requestSession();
    return getChromecast().status === 'connected';
  } catch {
    // Closing the device list rejects too.
    return false;
  }
}

export function disconnectChromecast() {
  if (state.status !== 'connected') return;
  win().cast?.framework.CastContext.getInstance().endCurrentSession(true);
}

/** Who the receiver should be when it talks to the Jellyfin server. */
export interface CastAuth {
  api: JellyfinApi;
  serverId: string;
  serverVersion?: string;
}

/** The server address as another device on the network has to open it. */
export function castServerAddress(serverUrl: string): string {
  return new URL(serverUrl, window.location.href).href.replace(/\/+$/, '');
}

/** True for addresses only this computer can open, which a Chromecast therefore can't. */
export function isLocalOnlyAddress(address: string): boolean {
  try {
    const host = new URL(address).hostname;
    return host === 'localhost' || host === '[::1]' || host.startsWith('127.');
  } catch {
    return false;
  }
}

const versions = new Map<string, Promise<string | undefined>>();

/** The receiver adapts to the server version, which the official clients always send along. */
function serverVersion(auth: CastAuth): Promise<string | undefined> {
  if (auth.serverVersion) return Promise.resolve(auth.serverVersion);
  let version = versions.get(auth.api.serverUrl);
  if (!version) {
    version = auth.api
      .get<{ Version?: string }>('/System/Info/Public')
      .then((info) => info.Version)
      .catch(() => undefined);
    versions.set(auth.api.serverUrl, version);
  }
  return version;
}

async function send(auth: CastAuth, command: string, options: Record<string, unknown> = {}): Promise<unknown> {
  const version = await serverVersion(auth);
  const session = win().cast?.framework.CastContext.getInstance().getCurrentSession();
  if (!session) throw new Error('Not connected to a Chromecast.');
  return session.sendMessage(NAMESPACE, {
    options,
    command,
    userId: auth.api.userId,
    deviceId: auth.api.deviceId,
    accessToken: auth.api.accessToken,
    serverAddress: castServerAddress(auth.api.serverUrl),
    serverId: auth.serverId,
    serverVersion: version,
    receiverName: session.getCastDevice().friendlyName,
  });
}

export interface CastPlayOptions {
  shuffle?: boolean;
  /** Add to the Chromecast's queue instead of replacing what it plays. */
  queue?: 'PlayNext' | 'PlayLast';
  /** Which of the items to start with. */
  startIndex?: number;
  startPositionTicks?: number;
  mediaSourceId?: string;
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
}

/** Plays items on the Chromecast. Shows, albums and other containers are expanded by the receiver. */
export function castPlay(auth: CastAuth, items: BaseItemDto[], opts: CastPlayOptions = {}): Promise<unknown> {
  if (isLocalOnlyAddress(castServerAddress(auth.api.serverUrl))) {
    return Promise.reject(
      new Error(
        'A Chromecast can’t reach a server at “localhost”. Open Jellyplex through an address other devices on your network can use.',
      ),
    );
  }
  return send(auth, opts.queue ?? (opts.shuffle ? 'Shuffle' : 'PlayNow'), {
    // The receiver looks the items up itself, so it only needs to know which ones.
    items: items.map((i) => ({
      Id: i.Id,
      ServerId: i.ServerId ?? auth.serverId,
      Name: i.Name,
      Type: i.Type,
      MediaType: i.MediaType,
      IsFolder: i.IsFolder,
    })),
    startIndex: opts.startIndex,
    startPositionTicks: opts.startPositionTicks,
    mediaSourceId: opts.mediaSourceId,
    audioStreamIndex: opts.audioStreamIndex,
    subtitleStreamIndex: opts.subtitleStreamIndex,
  });
}

export type CastCommand = 'Pause' | 'Unpause' | 'Stop' | 'NextTrack' | 'PreviousTrack';

export function castCommand(auth: CastAuth, command: CastCommand): Promise<unknown> {
  return send(auth, command);
}

export function castSeek(auth: CastAuth, seconds: number): Promise<unknown> {
  return send(auth, 'Seek', { position: seconds });
}

/** Volume of the device itself, 0–100. */
export function castSetVolume(volume: number): Promise<unknown> {
  const session = win().cast?.framework.CastContext.getInstance().getCurrentSession();
  if (!session) return Promise.resolve();
  return session
    .setVolume(Math.min(1, Math.max(0, volume / 100)))
    .then(() => update({ playState: { ...state.playState, VolumeLevel: volume, IsMuted: false } }));
}

export function castToggleMute(): Promise<unknown> {
  const session = win().cast?.framework.CastContext.getInstance().getCurrentSession();
  if (!session) return Promise.resolve();
  const mute = !(session.isMute() ?? state.playState?.IsMuted ?? false);
  return session.setMute(mute).then(() => update({ playState: { ...state.playState, IsMuted: mute } }));
}
