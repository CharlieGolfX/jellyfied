export interface RuntimeConfig {
  /** Jellyfin URL used by the browser. May be absolute or a path such as "/jellyfin". */
  serverUrl?: string;
  /** When true, users cannot pick a different server on the login screen. */
  lockServer?: boolean;
}

declare global {
  interface Window {
    JELLYFIED_CONFIG?: RuntimeConfig;
  }
}

export const APP_NAME = 'Jellyfied';
export const APP_VERSION = __APP_VERSION__;

const raw: RuntimeConfig = (typeof window !== 'undefined' && window.JELLYFIED_CONFIG) || {};

/**
 * Normalises a user-entered server address into an absolute base URL without a
 * trailing slash. Accepts "host:8096", "https://host/jellyfin/web/", "/jellyfin", etc.
 */
export function normalizeServerUrl(input: string, pageProtocol = window.location.protocol): string {
  let value = input.trim();
  if (!value) return '';
  if (value.startsWith('/')) {
    value = window.location.origin + value;
  } else if (!/^https?:\/\//i.test(value)) {
    // Without a scheme, the page's own: a page on https may not talk to a server on http.
    value = `${pageProtocol === 'https:' ? 'https' : 'http'}://${value}`;
  }
  const url = new URL(value);
  let path = url.pathname.replace(/\/+$/, '');
  // People often paste the Jellyfin web UI address.
  path = path.replace(/\/web(\/index\.html)?$/i, '');
  return `${url.protocol}//${url.host}${path}`;
}

function resolveConfiguredServer(): string {
  if (!raw.serverUrl) return '';
  try {
    return normalizeServerUrl(raw.serverUrl);
  } catch {
    return '';
  }
}

export const runtimeConfig = {
  serverUrl: resolveConfiguredServer(),
  lockServer: Boolean(raw.lockServer) && Boolean(raw.serverUrl),
};
