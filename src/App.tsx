import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { AppShell } from '@/components/layout/AppShell';
import { CrashState } from '@/components/ui/CrashState';
import { PrefsSync } from '@/lib/prefsSync';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { PageSpinner } from '@/components/ui/Spinner';
import HomePage from '@/pages/Home';
import LibraryPage from '@/pages/Library';
import ItemPage from '@/pages/item/ItemPage';
import LoginPage from '@/pages/Login';
import SearchPage from '@/pages/Search';
import FavoritesPage from '@/pages/Favorites';
import NotFoundPage from '@/pages/NotFound';
import { RemoteControlReceiver } from '@/player/RemoteControl';
import { PlayRoute, useVideoSession } from '@/player/VideoSession';
import { LiveUpdates } from '@/realtime/LiveUpdates';

const GlobalVideoPlayer = lazy(() => import('@/player/VideoPlayer'));
const SettingsPage = lazy(() => import('@/pages/Settings'));
const AdminRoutes = lazy(() => import('@/pages/admin/AdminRoutes'));

function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

/** Shown instead of the player when it crashed, so a player bug never takes browsing down with it. */
function PlayerCrash() {
  const { mode, minimize, close } = useVideoSession();
  const dismiss = () => {
    minimize();
    close();
  };
  return (
    <div
      role="alert"
      data-testid="player-crash"
      className={
        mode === 'full'
          ? 'fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black px-6 text-center'
          : 'fixed right-4 bottom-4 z-[60] flex w-[min(420px,calc(100vw-2rem))] flex-col items-center gap-3 rounded-lg bg-base-850 p-4 text-center shadow-2xl ring-1 ring-white/15'
      }
    >
      <p className="text-sm text-muted">The player ran into an error and was stopped.</p>
      <button onClick={dismiss} className="rounded-md bg-white/10 px-4 py-2 text-sm hover:bg-white/20">
        {mode === 'full' ? 'Go back' : 'Close'}
      </button>
    </div>
  );
}

/** The video player is mounted outside the routes so it keeps playing while you browse. */
function PlayerHost() {
  const { session } = useVideoSession();
  const { session: auth } = useAuth();
  if (!auth) return null;
  return (
    <>
      <RemoteControlReceiver />
      <LiveUpdates />
      <PrefsSync />
      {session && (
        <ErrorBoundary resetKey={session.key} fallback={() => <PlayerCrash />}>
          <Suspense fallback={null}>
            <GlobalVideoPlayer />
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary fallback={(error, reset) => <CrashState error={error} onRetry={reset} fullPage />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/play/:id"
          element={
            <RequireAuth>
              <PlayRoute />
            </RequireAuth>
          }
        />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="library/:id" element={<LibraryPage />} />
          <Route path="item/:id" element={<ItemPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="favorites" element={<FavoritesPage />} />
          <Route
            path="settings"
            element={
              <Suspense fallback={<PageSpinner />}>
                <SettingsPage />
              </Suspense>
            }
          />
          <Route
            path="admin/*"
            element={
              <Suspense fallback={<PageSpinner />}>
                <AdminRoutes />
              </Suspense>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      <PlayerHost />
    </ErrorBoundary>
  );
}
