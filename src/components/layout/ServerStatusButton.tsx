import clsx from 'clsx';
import { Activity, ArrowUpCircle, CheckCircle2, LayoutDashboard, Pause, Play, RefreshCw, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cardImage, imageSrc } from '@/api/images';
import type { SessionInfo, SystemInfo, TaskInfo } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { Img } from '@/components/ui/States';
import { APP_NAME, APP_VERSION } from '@/config';
import { t } from '@/i18n';
import { episodeLabel, ticksToSeconds } from '@/lib/format';
import { isNewerVersion } from '@/lib/version';

/** The scheduled task that scans every library. */
const SCAN_TASK = 'RefreshLibrary';
/** Releases are looked up this seldom, so the GitHub limit of 60 requests an hour is never near. */
const RELEASE_CHECK_INTERVAL = 6 * 60 * 60 * 1000;

interface Release {
  version: string;
  url: string;
}

/** The newest release of a GitHub project, remembered in this browser between page loads. */
async function latestRelease(repo: string): Promise<Release | null> {
  const key = `jellyfied.latestRelease.${repo}`;
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as (Release & { at: number }) | null;
    if (saved && Date.now() - saved.at < RELEASE_CHECK_INTERVAL) return saved;
  } catch {
    /* look it up again */
  }
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) return null;
  const body = (await res.json()) as { tag_name?: string; html_url?: string };
  if (!body.tag_name || !body.html_url) return null;
  const release = { version: body.tag_name.replace(/^v/i, ''), url: body.html_url };
  try {
    localStorage.setItem(key, JSON.stringify({ ...release, at: Date.now() }));
  } catch {
    /* ignore */
  }
  return release;
}

function useLatestRelease(repo: string) {
  return useQuery({
    queryKey: ['latestRelease', repo],
    queryFn: () => latestRelease(repo),
    staleTime: RELEASE_CHECK_INTERVAL,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

function PlayingRow({ session }: { session: SessionInfo }) {
  const api = useApi();
  const item = session.NowPlayingItem!;
  const ps = session.PlayState ?? {};
  const total = ticksToSeconds(item.RunTimeTicks);
  const pct = total ? Math.min(100, (ticksToSeconds(ps.PositionTicks) / total) * 100) : 0;
  const title = item.Type === 'Episode' ? item.SeriesName : item.Name;
  const sub =
    item.Type === 'Episode'
      ? `${episodeLabel(item)} · ${item.Name}`
      : item.Type === 'Audio'
        ? item.Artists?.join(', ')
        : item.ProductionYear;

  return (
    <Link to={`/item/${item.Id}`} className="flex gap-3 rounded-md px-2 py-2 hover:bg-white/10">
      <span className="h-14 w-10 shrink-0 overflow-hidden rounded bg-base-800">
        <Img src={imageSrc(api, cardImage(item, 'poster'), 80)} className="h-full w-full object-cover" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
        <span className="block truncate text-xs text-faint">
          {session.UserName} · {session.DeviceName}
          {ps.PlayMethod === 'Transcode' ? ` · ${t('player.playbackInfo.transcode')}` : ''}
        </span>
        <span className="mt-1.5 flex items-center gap-1.5">
          {ps.IsPaused ? <Pause size={10} className="shrink-0 text-muted" /> : <Play size={10} className="shrink-0 text-accent" />}
          <span className="relative h-1 flex-1 overflow-hidden rounded bg-white/15">
            <span className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${pct}%` }} />
          </span>
        </span>
      </span>
    </Link>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-white/10 px-2 py-2 first:border-t-0">
      <div className="px-2 pt-1 pb-1.5 text-[11px] font-semibold tracking-wider text-faint uppercase">{title}</div>
      {children}
    </div>
  );
}

function Note({ icon, children, href }: { icon: ReactNode; children: ReactNode; href?: string }) {
  const body = (
    <>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </>
  );
  const className = 'flex gap-2.5 rounded-md px-2 py-1.5 text-sm';
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={clsx(className, 'hover:bg-white/10')}>
      {body}
    </a>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** Top-bar button for administrators: what the whole server is playing and doing, and what can be updated. */
export function ServerStatusButton() {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  // The same queries as the dashboard, so the two share what they fetched. Checked more often while open.
  const sessions = useQuery({
    queryKey: ['admin', 'sessions'],
    queryFn: () => api.get<SessionInfo[]>('/Sessions', { activeWithinSeconds: 960 }),
    refetchInterval: open ? 4000 : 15_000,
  });
  const tasks = useQuery({
    queryKey: ['admin', 'tasks'],
    queryFn: () => api.get<TaskInfo[]>('/ScheduledTasks', { isHidden: false }),
    refetchInterval: open ? 3000 : 15_000,
  });
  const info = useQuery({ queryKey: ['admin', 'sysinfo'], queryFn: () => api.get<SystemInfo>('/System/Info'), refetchInterval: 60_000 });
  const jellyfinRelease = useLatestRelease('jellyfin/jellyfin');
  const jellyfiedRelease = useLatestRelease('CharlieGolfX/jellyfied');

  const playing = (sessions.data ?? []).filter((s) => s.NowPlayingItem);
  const running = (tasks.data ?? []).filter((task) => task.State !== 'Idle');
  const scanning = running.some((task) => task.Key === SCAN_TASK);
  const sys = info.data;
  const jellyfinUpdate = jellyfinRelease.data && isNewerVersion(jellyfinRelease.data.version, sys?.Version) ? jellyfinRelease.data : null;
  const hasJellyfinUpdate = Boolean(sys?.HasUpdateAvailable) || jellyfinUpdate !== null;
  const jellyfiedUpdate =
    jellyfiedRelease.data && isNewerVersion(jellyfiedRelease.data.version, APP_VERSION) ? jellyfiedRelease.data : null;
  const attention = hasJellyfinUpdate || jellyfiedUpdate !== null || Boolean(sys?.HasPendingRestart);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t('layout.serverStatus.title')}
        title={t('layout.serverStatus.title')}
        className={clsx('relative rounded-full p-2 hover:bg-white/10', open ? 'text-accent' : 'text-muted hover:text-fg')}
      >
        <Activity size={20} className={clsx(scanning && 'animate-pulse')} />
        {playing.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-fill px-1 text-[10px] font-bold text-accent-ink tabular-nums">
            {playing.length}
          </span>
        )}
        {playing.length === 0 && attention && (
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-info ring-2 ring-base-850" />
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t('layout.serverStatus.title')}
          className="animate-pop-in fixed top-14 right-2 z-50 flex max-h-[calc(100vh-4.5rem)] w-[min(24rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-lg bg-base-750 shadow-2xl ring-1 ring-black/40 sm:right-4"
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Section
              title={playing.length ? t('admin.dashboard.nowPlayingCount', { count: playing.length }) : t('admin.dashboard.nowPlaying')}
            >
              {playing.length === 0 ? (
                <p className="px-2 pb-1 text-sm text-muted">{t('admin.dashboard.nothingIsPlayingRightNow')}</p>
              ) : (
                playing.map((s) => <PlayingRow key={s.Id} session={s} />)
              )}
            </Section>

            <Section title={t('layout.serverStatus.activity')}>
              {running.length === 0 ? (
                <p className="px-2 pb-1 text-sm text-muted">{t('admin.dashboard.noTasksAreRunning')}</p>
              ) : (
                <div className="space-y-2.5 px-2 pb-1">
                  {running.map((task) => (
                    <div key={task.Id}>
                      <div className="flex items-center gap-2 text-sm">
                        {task.Key === SCAN_TASK && <RefreshCw size={13} className="shrink-0 animate-spin text-accent" />}
                        <span className="min-w-0 flex-1 truncate">
                          {task.Key === SCAN_TASK ? t('layout.serverStatus.scanning') : task.Name}
                        </span>
                        <span className="shrink-0 text-xs text-muted tabular-nums">{Math.round(task.CurrentProgressPercentage ?? 0)}%</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded bg-white/10">
                        <div className="h-full bg-accent transition-all" style={{ width: `${task.CurrentProgressPercentage ?? 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title={t('layout.serverStatus.updates')}>
              {sys?.HasPendingRestart && (
                <Note icon={<RotateCcw size={15} className="text-star" />}>{t('admin.dashboard.restartPending')}</Note>
              )}
              {hasJellyfinUpdate && (
                <Note icon={<ArrowUpCircle size={15} className="text-info" />} href={jellyfinUpdate?.url}>
                  <span className="block">
                    {jellyfinUpdate
                      ? t('layout.serverStatus.updateTo', { name: 'Jellyfin', version: jellyfinUpdate.version })
                      : t('admin.dashboard.updateAvailable')}
                  </span>
                  <span className="block text-xs text-muted">{t('layout.serverStatus.installed', { version: sys?.Version })}</span>
                </Note>
              )}
              {jellyfiedUpdate && (
                <Note icon={<ArrowUpCircle size={15} className="text-info" />} href={jellyfiedUpdate.url}>
                  <span className="block">{t('layout.serverStatus.updateTo', { name: APP_NAME, version: jellyfiedUpdate.version })}</span>
                  <span className="block text-xs text-muted">{t('layout.serverStatus.installed', { version: APP_VERSION })}</span>
                </Note>
              )}
              {!attention && (
                <Note icon={<CheckCircle2 size={15} className="text-success" />}>
                  <span className="block">{t('layout.serverStatus.upToDate')}</span>
                  <span className="block text-xs text-muted">
                    Jellyfin {sys?.Version ?? '…'} · {APP_NAME} {APP_VERSION}
                  </span>
                </Note>
              )}
            </Section>
          </div>
          <Link
            to="/admin"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 border-t border-white/10 px-4 py-2.5 text-sm text-accent hover:bg-white/5"
          >
            <LayoutDashboard size={15} />
            {t('nav.serverDashboard')}
          </Link>
        </div>
      )}
    </div>
  );
}
