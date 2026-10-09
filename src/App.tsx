import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { AppShell } from '@/components/layout/AppShell';
import { PageSpinner } from '@/components/ui/Spinner';
import HomePage from '@/pages/Home';
import LibraryPage from '@/pages/Library';
import ItemPage from '@/pages/item/ItemPage';
import LoginPage from '@/pages/Login';
import SearchPage from '@/pages/Search';
import FavoritesPage from '@/pages/Favorites';
import NotFoundPage from '@/pages/NotFound';
import { PlayRoute, useVideoSession } from '@/player/VideoSession';

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

/** The video player is mounted outside the routes so it keeps playing while you browse. */
function PlayerHost() {
  const { session } = useVideoSession();
  const { session: auth } = useAuth();
  if (!session || !auth) return null;
  return (
    <Suspense fallback={null}>
      <GlobalVideoPlayer />
    </Suspense>
  );
}

export default function App() {
  return (
    <>
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
    </>
  );
}
