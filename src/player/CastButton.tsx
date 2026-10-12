import clsx from 'clsx';
import { Cast, MonitorPlay, Tv } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BaseItemDto, SessionInfo } from '@/api/types';
import { useApi, useSession } from '@/auth/AuthProvider';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { episodeLabel } from '@/lib/format';
import { setCastTarget, useCastTarget } from './castTarget';
import {
  chromecastSupported,
  connectChromecast,
  disconnectChromecast,
  onChromecastError,
  resumeChromecast,
  useChromecast,
} from './chromecast';
import { t } from '@/i18n';

// ---------------------------------------------------------------------------
// Sending playback to another device
// ---------------------------------------------------------------------------

export function useControllableSessions(enabled: boolean, interval: number) {
  const api = useApi();
  const { userId } = useSession();
  return useQuery({
    queryKey: ['cast-sessions', userId],
    queryFn: async () =>
      (await api.get<SessionInfo[]>('/Sessions', { controllableByUserId: userId })).filter(
        (s) => s.SupportsRemoteControl && s.DeviceId !== api.deviceId,
      ),
    enabled,
    refetchInterval: interval,
    staleTime: 0,
  });
}

export function nowPlayingLabel(item: BaseItemDto): string {
  if (item.Type === 'Episode') return `${item.SeriesName ?? ''} ${episodeLabel(item)}`.trim();
  return item.Name ?? '';
}

/** Top-bar button: pick another device to play on. */
export function CastButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const target = useCastTarget();
  const chromecast = useChromecast();
  const toast = useToast();
  const sessions = useControllableSessions(open, 3000);
  const casting = chromecast.status === 'connected';

  // Join a Chromecast session that was open before a reload, and show what the Chromecast reports.
  useEffect(() => {
    resumeChromecast();
    onChromecastError((message) => toast.error(message));
    return () => onChromecastError(null);
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const list = sessions.data ?? [];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t('player.castButton.playOnAnotherDevice')}
        title={
          casting
            ? t('player.castButton.playingOn', { deviceName: chromecast.deviceName })
            : target
              ? t('player.castButton.playingOn', { deviceName: target.deviceName })
              : t('player.castButton.playOnAnotherDevice')
        }
        className={clsx('rounded-full p-2 hover:bg-white/10', open || target || casting ? 'text-accent' : 'text-muted hover:text-fg')}
      >
        <Cast size={20} />
      </button>
      {open && (
        <div className="animate-pop-in absolute top-12 right-0 z-50 w-80 max-w-[calc(100vw-1rem)] rounded-lg bg-base-750 py-2 shadow-2xl ring-1 ring-black/40">
          <div className="px-4 pt-1 pb-2 text-[11px] font-semibold tracking-wider text-faint uppercase">
            {t('player.castButton.playOn')}
          </div>
          <button
            onClick={() => {
              setCastTarget(null);
              disconnectChromecast();
              setOpen(false);
            }}
            className={clsx(
              'flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-white/10',
              !target && !casting && 'text-accent',
            )}
          >
            <MonitorPlay size={18} className="shrink-0" />
            <span className="min-w-0 flex-1">{t('common.thisDevice')}</span>
          </button>
          {sessions.isLoading ? (
            <div className="flex justify-center py-4 text-accent">
              <Spinner size={20} />
            </div>
          ) : list.length === 0 ? (
            <p className="px-4 py-3 text-xs text-faint">{t('player.castButton.noOtherJellyfinAppsFound')}</p>
          ) : (
            list.map((s) => (
              <button
                key={s.Id}
                data-testid="cast-target"
                onClick={() => {
                  disconnectChromecast();
                  setCastTarget({
                    sessionId: s.Id,
                    deviceName: s.DeviceName ?? t('player.castButton.unknownDevice'),
                    client: s.Client ?? '',
                    userName: s.UserName ?? '',
                  });
                  setOpen(false);
                }}
                className={clsx(
                  'flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-white/10',
                  !casting && target?.sessionId === s.Id && 'text-accent',
                )}
              >
                <Cast size={18} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{s.DeviceName}</span>
                  <span className="block truncate text-xs text-muted">
                    {[s.Client, s.UserName].filter(Boolean).join(' · ')}
                    {s.NowPlayingItem ? ` · ${nowPlayingLabel(s.NowPlayingItem)}` : ''}
                  </span>
                </span>
              </button>
            ))
          )}
          {chromecastSupported && (
            <button
              data-testid="chromecast-target"
              disabled={chromecast.status === 'loading'}
              onClick={() => {
                setOpen(false);
                if (casting) return;
                void connectChromecast().then((connected) => {
                  if (connected) setCastTarget(null);
                  else if (!navigator.onLine) toast.error(t('player.castButton.needsInternet'));
                });
              }}
              className={clsx(
                'flex w-full items-center gap-3 border-t border-white/10 px-4 py-2 text-left text-sm hover:bg-white/10 disabled:opacity-50',
                casting && 'text-accent',
              )}
            >
              <Tv size={18} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{casting ? chromecast.deviceName : t('player.castButton.chromecastMenu')}</span>
                <span className="block truncate text-xs text-muted">
                  {casting ? t('player.castButton.chromecastName') : t('player.castButton.pickDevice')}
                </span>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
