export interface RuntimeConfig {
  /** Jellyfin URL used by the browser. May be absolute or a path such as "/jellyfin". */
  serverUrl?: string;
  /** When true, users cannot pick a different server on the login screen. */
  lockServer?: boolean;
}

declare global {
  interface Window {
    JELLYPLEX_CONFIG?: RuntimeConfig;
  }
}

export const APP_NAME = 'Jellyplex';
export const APP_VERSION = '1.0.0';

const raw: RuntimeConfig = (typeof window !== 'undefined' && window.JELLYPLEX_CONFIG) || {};

/**
 * Normalises a user-entered server address into an absolute base URL without a
 * trailing slash. Accepts "host:8096", "https://host/jellyfin/web/", "/jellyfin", etc.
 */
export function normalizeServerUrl(input: string): string {
  let value = input.trim();
  if (!value) return '';
  if (value.startsWith('/')) {
    value = window.location.origin + value;
  } else if (!/^https?:\/\//i.test(value)) {
    value = `http://${value}`;
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
