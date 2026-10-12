/**
 * Where Jellyfied lives on its host: '' at the root, or '/jellyfied' when it is served under a
 * path (JELLYFIED_BASE_PATH in the container). It comes from the <base> tag in index.html, which
 * the container's entrypoint rewrites, so one build works at any path.
 */
export function basePathOf(baseUri: string): string {
  try {
    return new URL(baseUri).pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export const BASE_PATH = typeof document === 'undefined' ? '' : basePathOf(document.baseURI);

/** An address inside the app as the browser has to request it, for the few places that bypass the router. */
export function appPath(path: string, base: string = BASE_PATH): string {
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** The app's own part of a browser path (`window.location.pathname`), without the base path. */
export function stripBasePath(pathname: string, base: string = BASE_PATH): string {
  if (!base) return pathname;
  if (pathname === base) return '/';
  return pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname;
}
