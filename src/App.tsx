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
import LoginPage from '@/pages/Login';
import NotFoundPage from '@/pages/NotFound';
import { RemoteControlReceiver } from '@/player/RemoteControl';
import { SyncPlayInvites } from '@/player/SyncPlayInvites';
import { SyncPlayPicker } from '@/player/SyncPlayPicker';
import { PlayRoute, useVideoSession } from '@/player/VideoSession';
import { LiveUpdates } from '@/realtime/LiveUpdates';
import { t } from '@/i18n';

const GlobalVideoPlayer = lazy(() => import('@/player/VideoPlayer'));
// Pages away from the first screen load on demand, which keeps the first download small.
const ItemPage = lazy(() => import('@/pages/item/ItemPage'));
const SearchPage = lazy(() => import('@/pages/Search'));
const FavoritesPage = lazy(() => import('@/pages/Favorites'));
const SettingsPage = lazy(() => import('@/pages/Settings'));
const StatsPage = lazy(() => import('@/pages/Stats'));
const AdminRoutes = lazy(() => import('@/pages/admin/AdminRoutes'));

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageSpinner />}>{children}</Suspense>;
}

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
      <p className="text-sm text-muted">{t('app.playerCrashed')}</p>
      <button onClick={dismiss} className="rounded-md bg-white/10 px-4 py-2 text-sm hover:bg-white/20">
        {mode === 'full' ? t('app.goBack') : t('common.close')}
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
      <SyncPlayInvites />
      <SyncPlayPicker />
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
          <Route
            path="item/:id"
            element={
              <Lazy>
                <ItemPage />
              </Lazy>
            }
          />
          <Route
            path="search"
            element={
              <Lazy>
                <SearchPage />
              </Lazy>
            }
          />
          <Route
            path="favorites"
            element={
              <Lazy>
                <FavoritesPage />
              </Lazy>
            }
          />
          <Route
            path="settings"
            element={
              <Lazy>
                <SettingsPage />
              </Lazy>
            }
          />
          <Route
            path="stats"
            element={
              <Lazy>
                <StatsPage />
              </Lazy>
            }
          />
          <Route
            path="admin/*"
            element={
              <Lazy>
                <AdminRoutes />
              </Lazy>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      <PlayerHost />
    </ErrorBoundary>
  );
}
