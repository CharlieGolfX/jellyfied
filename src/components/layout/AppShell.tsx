import clsx from 'clsx';
import { t } from '@/i18n';
import { LayoutDashboard, Menu as MenuIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigationType } from 'react-router-dom';
import { APP_NAME } from '@/config';
import { useIsAdmin } from '@/auth/AuthProvider';
import { CrashState } from '@/components/ui/CrashState';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { AudioBar } from '@/player/AudioBar';
import { CastButton } from '@/player/CastButton';
import { RemoteBar } from '@/player/RemoteBar';
import { SyncPlayButton } from '@/player/SyncPlayProvider';
import { useVideoSession } from '@/player/VideoSession';
import { CardSizeButton } from './CardSizeButton';
import { AppIcon, Logo } from './Logo';
import { SearchBox } from './SearchBox';
import { ServerStatusButton } from './ServerStatusButton';
import { Sidebar } from './Sidebar';
import { UserMenu } from './UserMenu';
import { readString, writeString } from '@/lib/storage';

const COLLAPSE_KEY = 'jellyfied.sidebarCollapsed';
/*
 * Scrolling: four parts move the same scroller (#main-scroll), each for its own reason.
 *
 *   - AppShell (here) remembers each history entry's position and, going back, scrolls there again
 *     for a few frames while the page grows into it. It stops at the user's first wheel or touch.
 *   - useRowWindow renders only the rows near the view. When a resize changes the row height, it
 *     scrolls by the difference (`shift`), so the same rows stay in view.
 *   - LibraryGrid scrolls to a letter of the A–Z bar, and by the height of rows that a page loaded
 *     *above* the view adds. It notes the time of its own scrolls (`ownScroll`), so that those aren't
 *     taken for the user scrolling up, which is what loads the titles above a letter.
 *   - Hub keeps each horizontal row's position per history entry, the way AppShell does the page's.
 *
 * They don't step on each other because each one only acts on its own trigger: a new path (AppShell),
 * a resize (useRowWindow), a letter or rows added above (LibraryGrid), a row's own scroll (Hub). A
 * new scroll writer should do the same, and mark its scrolls if a scroll listener could misread them.
 */
/** How far each page in the history was scrolled, by the key the router gives its history entry. */
const scrollPositions = new Map<string, number>();
/** Going back further than this many pages starts at the top: the map doesn't grow without end. */
const KEPT_POSITIONS = 100;

function keepPosition(key: string, top: number) {
  // Newest last, so the oldest is the first to go.
  scrollPositions.delete(key);
  scrollPositions.set(key, top);
  if (scrollPositions.size > KEPT_POSITIONS) scrollPositions.delete(scrollPositions.keys().next().value!);
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => readString(COLLAPSE_KEY) === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const isAdmin = useIsAdmin();
  const video = useVideoSession();
  // Keep the end of every page reachable when the mini player floats over it.
  const miniPlayerPad = video.session && video.mode === 'mini' ? 'calc(min(420px, 100vw - 2rem) * 9 / 16 + 2rem)' : undefined;

  useEffect(() => {
    writeString(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  // A new page closes the mobile drawer…
  const [path, setPath] = useState(location.pathname);
  if (path !== location.pathname) {
    setPath(location.pathname);
    setMobileOpen(false);
  }
  // …and starts at the top, except when going back or forward: then it returns to where it was.
  const navigation = useNavigationType();
  // Filters and tabs replace the history entry, which gives it a new key: positions go under the latest.
  const entryKey = useRef(location.key);
  const entryPath = useRef(location.pathname);
  // Both of these run as part of the page change itself, not after it: the old page's content
  // going away scrolls the area to the top, and that must not be taken for the user doing so.
  useLayoutEffect(() => {
    const samePage = entryPath.current === location.pathname && entryKey.current !== location.key;
    entryKey.current = location.key;
    entryPath.current = location.pathname;
    if (samePage && mainRef.current) keepPosition(location.key, mainRef.current.scrollTop);
  }, [location.key, location.pathname]);
  // A change of filter or tab is the same page: it has the same path, and keeps its place. So this
  // runs for a new path only, whatever else changed with it.
  // oxlint-disable react/exhaustive-effect-dependencies, react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const target = navigation === 'POP' ? (scrollPositions.get(entryKey.current) ?? 0) : 0;
    // Not while the old position is being returned to: the page may be too short for it at first.
    let restoring = target > 0;
    const remember = () => {
      if (!restoring) keepPosition(entryKey.current, main.scrollTop);
    };
    main.addEventListener('scroll', remember, { passive: true });
    main.scrollTo({ top: target });
    // A long list is only that long once it has loaded and been laid out again: keep trying for a
    // moment, and stop as soon as the user scrolls themselves.
    let frame = 0;
    let tries = 0;
    const stop = () => {
      cancelAnimationFrame(frame);
      restoring = false;
    };
    const retry = () => {
      if (Math.abs(main.scrollTop - target) < 2 || ++tries > 120) return stop();
      main.scrollTo({ top: target });
      frame = requestAnimationFrame(retry);
    };
    if (target > 0) {
      frame = requestAnimationFrame(retry);
      main.addEventListener('wheel', stop, { passive: true, once: true });
      main.addEventListener('touchstart', stop, { passive: true, once: true });
    }
    return () => {
      stop();
      main.removeEventListener('scroll', remember);
      main.removeEventListener('wheel', stop);
      main.removeEventListener('touchstart', stop);
    };
  }, [location.pathname]);
  // oxlint-enable react/exhaustive-effect-dependencies, react-hooks/exhaustive-deps

  const toggleSidebar = () => {
    if (window.matchMedia('(min-width: 1024px)').matches) setCollapsed((c) => !c);
    else setMobileOpen((o) => !o);
  };

  return (
    <div className="flex h-full flex-col bg-base-900">
      <header className="z-40 flex h-14 shrink-0 items-center gap-3 bg-base-850 px-3 shadow-[0_1px_0_rgba(0,0,0,0.5)] sm:px-4">
        <button
          onClick={toggleSidebar}
          className="rounded-full p-2 text-muted hover:bg-white/10 hover:text-fg"
          aria-label={t('nav.toggleSidebar')}
        >
          <MenuIcon size={22} />
        </button>
        {/* The name starts with the word on screen, so saying "Jellyfied" (speech control) finds it. */}
        <Link to="/" className="mr-2 hidden shrink-0 sm:block" aria-label={`${APP_NAME} · ${t('common.home')}`}>
          <Logo className="text-2xl" />
        </Link>
        <Link to="/" className="shrink-0 sm:hidden" aria-label={t('common.home')}>
          <AppIcon className="h-7 w-7" />
        </Link>
        <div className="flex min-w-0 flex-1 justify-center">
          <SearchBox />
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <SyncPlayButton />
          <CastButton />
          <CardSizeButton />
          {isAdmin && (
            <Link
              to="/admin"
              className="hidden rounded-full p-2 text-muted hover:bg-white/10 hover:text-fg sm:block"
              title={t('nav.serverDashboard')}
            >
              <LayoutDashboard size={20} />
            </Link>
          )}
          {isAdmin && <ServerStatusButton />}
          <UserMenu />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <aside className={clsx('hidden shrink-0 bg-base-850/70 transition-[width] duration-200 lg:block', collapsed ? 'w-[68px]' : 'w-60')}>
          <Sidebar collapsed={collapsed} />
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 top-14 z-30 lg:hidden">
            <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
            <aside className="animate-pop-in absolute inset-y-0 left-0 w-64 bg-base-850 shadow-2xl">
              <Sidebar collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </aside>
          </div>
        )}

        <main
          ref={mainRef}
          id="main-scroll"
          className="bg-app-gradient min-w-0 flex-1 overflow-y-auto"
          style={{ paddingBottom: miniPlayerPad }}
        >
          <ErrorBoundary resetKey={location.pathname} fallback={(error, reset) => <CrashState error={error} onRetry={reset} />}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      <AudioBar />
      <RemoteBar />
    </div>
  );
}
