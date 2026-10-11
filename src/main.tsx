import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { appPath, BASE_PATH, stripBasePath } from '@/lib/basePath';
import { AuthProvider } from '@/auth/AuthProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { AudioPlayerProvider } from '@/player/AudioPlayerProvider';
import { SyncPlayProvider } from '@/player/SyncPlayProvider';
import { RealtimeProvider } from '@/realtime/RealtimeProvider';
import { VideoSessionProvider } from '@/player/VideoSession';
import App from './App';
import './index.css';
// Applies the saved interface colours before the first render.
import '@/lib/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
        return count < 2;
      },
    },
  },
});

// Served under a path, but opened outside it (e.g. the bare host name): go to the app.
if (BASE_PATH && stripBasePath(window.location.pathname) === window.location.pathname) {
  window.location.replace(appPath('/'));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={BASE_PATH || undefined}>
        <ToastProvider>
          <AuthProvider>
            <RealtimeProvider>
              <AudioPlayerProvider>
                <VideoSessionProvider>
                  <SyncPlayProvider>
                    <App />
                  </SyncPlayProvider>
                </VideoSessionProvider>
              </AudioPlayerProvider>
            </RealtimeProvider>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
