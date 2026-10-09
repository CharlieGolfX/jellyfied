import clsx from 'clsx';
import { LayoutDashboard, Menu as MenuIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useIsAdmin } from '@/auth/AuthProvider';
import { AudioBar } from '@/player/AudioBar';
import { useVideoSession } from '@/player/VideoSession';
import { CardSizeButton } from './CardSizeButton';
import { JellyfinIcon, Logo } from './Logo';
import { SearchBox } from './SearchBox';
import { Sidebar } from './Sidebar';
import { UserMenu } from './UserMenu';

const COLLAPSE_KEY = 'jellyplex.sidebarCollapsed';

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const isAdmin = useIsAdmin();
  const video = useVideoSession();
  // Keep the end of every page reachable when the mini player floats over it.
  const miniPlayerPad = video.session && video.mode === 'mini' ? 'calc(min(420px, 100vw - 2rem) * 9 / 16 + 2rem)' : undefined;

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  // Start each page at the top, and close the mobile drawer.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
    setMobileOpen(false);
  }, [location.pathname]);

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
          aria-label="Toggle sidebar"
        >
          <MenuIcon size={22} />
        </button>
        <Link to="/" className="mr-2 hidden shrink-0 sm:block" aria-label="Home">
          <Logo className="h-8" />
        </Link>
        <Link to="/" className="shrink-0 sm:hidden" aria-label="Home">
          <JellyfinIcon className="h-7 w-7" />
        </Link>
        <div className="flex min-w-0 flex-1 justify-center">
          <SearchBox />
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <CardSizeButton />
          {isAdmin && (
            <Link
              to="/admin"
              className="hidden rounded-full p-2 text-muted hover:bg-white/10 hover:text-fg sm:block"
              title="Server dashboard"
            >
              <LayoutDashboard size={20} />
            </Link>
          )}
          <UserMenu />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <aside
          className={clsx(
            'hidden shrink-0 bg-base-850/70 transition-[width] duration-200 lg:block',
            collapsed ? 'w-[68px]' : 'w-60',
          )}
        >
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
          <Outlet />
        </main>
      </div>

      <AudioBar />
    </div>
  );
}
