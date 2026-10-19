import clsx from 'clsx';
import { Film, HardDrive, MessageSquare, Music, Pause, Play, Power, RefreshCw, RotateCcw, Square, Tv } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { backdropSrc, cardImage, imageSrc } from '@/api/images';
import type {
  ActivityLogEntry,
  FolderStorage,
  ItemCounts,
  ItemsResult,
  SessionInfo,
  SystemInfo,
  SystemStorage,
  TaskInfo,
} from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { Avatar } from '@/components/layout/UserMenu';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Img } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { episodeLabel, formatBitrate, formatBytes, formatClock, formatNumber, formatRelative, ticksToSeconds } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { AdminPage, StatusPill } from './shared';
import { t } from '@/i18n';

function useSessions() {
  const api = useApi();
  return useQuery({
    queryKey: ['admin', 'sessions'],
    queryFn: () => api.get<SessionInfo[]>('/Sessions', { activeWithinSeconds: 960 }),
    refetchInterval: 4000,
  });
}

function NowPlayingCard({ session }: { session: SessionInfo }) {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();
  const [messageOpen, setMessageOpen] = useState(false);
  const [message, setMessage] = useState('');
  const item = session.NowPlayingItem!;
  const ps = session.PlayState ?? {};
  const ti = session.TranscodingInfo;
  const pos = ticksToSeconds(ps.PositionTicks);
  const total = ticksToSeconds(item.RunTimeTicks);
  const pct = total ? Math.min(100, (pos / total) * 100) : 0;
  const bg = backdropSrc(api, item, 800);
  const poster = imageSrc(api, cardImage(item, 'poster'), 200);

  const command = useMutation({
    mutationFn: (cmd: 'PlayPause' | 'Stop') => api.post(`/Sessions/${session.Id}/Playing/${cmd}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'sessions'] }),
    onError: (e) => toast.error(e),
  });
  const sendMessage = useMutation({
    mutationFn: () =>
      api.post(`/Sessions/${session.Id}/Message`, { Header: t('admin.dashboard.messageFromServer'), Text: message, TimeoutMs: 10000 }),
    onSuccess: () => {
      toast.success(t('admin.dashboard.messageSent'));
      setMessage('');
      setMessageOpen(false);
    },
    onError: (e) => toast.error(e),
  });

  const method =
    ps.PlayMethod === 'Transcode'
      ? t('player.playbackInfo.transcode')
      : ps.PlayMethod === 'DirectStream'
        ? t('admin.dashboard.directStream')
        : t('admin.dashboard.directPlay');
  const title = item.Type === 'Episode' ? item.SeriesName : item.Name;
  const sub =
    item.Type === 'Episode'
      ? `${episodeLabel(item)} · ${item.Name}`
      : item.Type === 'Audio'
        ? item.Artists?.join(', ')
        : item.ProductionYear;

  return (
    <div className="relative overflow-hidden rounded-lg bg-base-800 ring-1 ring-white/5">
      {bg && <Img src={bg} className="absolute inset-0 h-full w-full object-cover opacity-20 blur-sm" />}
      <div className="relative flex gap-4 p-4">
        <Link to={`/item/${item.Id}`} className="h-28 w-20 shrink-0 overflow-hidden rounded bg-base-750">
          <Img src={poster} className="h-full w-full object-cover" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-semibold">{title}</div>
              <div className="truncate text-sm text-muted">{sub}</div>
            </div>
            <StatusPill tone={ps.PlayMethod === 'Transcode' ? 'amber' : 'green'}>{method}</StatusPill>
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <Avatar userId={session.UserId ?? ''} name={session.UserName ?? '?'} size={20} />
            <span className="truncate">{session.UserName}</span>
            <span className="text-faint">·</span>
            <span className="truncate text-muted">
              {t('admin.dashboard.clientOnDevice', { client: session.Client, device: session.DeviceName })}
            </span>
          </div>
          {ti && ps.PlayMethod === 'Transcode' && (
            <div className="mt-1 truncate text-xs text-faint">
              {ti.IsVideoDirect
                ? t('admin.dashboard.videoCopy')
                : t('admin.dashboard.video', { codec: ti.VideoCodec?.toUpperCase() ?? '?' })}
              {' · '}
              {ti.IsAudioDirect
                ? t('admin.dashboard.audioCopy')
                : t('admin.dashboard.audio', { codec: ti.AudioCodec?.toUpperCase() ?? '?' })}
              {ti.Bitrate ? ` · ${formatBitrate(ti.Bitrate)}` : ''}
              {ti.Framerate ? t('admin.dashboard.fps', { fps: Math.round(ti.Framerate) }) : ''}
              {ti.HardwareAccelerationType && ti.HardwareAccelerationType !== 'none'
                ? t('admin.dashboard.hw', { hardwareAccelerationType: ti.HardwareAccelerationType })
                : ''}
              {ti.TranscodeReasons?.length ? ` · ${ti.TranscodeReasons.join(', ')}` : ''}
            </div>
          )}
          <div className="mt-3 flex items-center gap-2 text-xs text-muted tabular-nums">
            {ps.IsPaused ? <Pause size={12} /> : <Play size={12} className="text-accent" />}
            <span>{formatClock(pos)}</span>
            <div className="relative h-1 flex-1 overflow-hidden rounded bg-white/15">
              {ti?.CompletionPercentage ? (
                <div className="absolute inset-y-0 left-0 bg-white/25" style={{ width: `${ti.CompletionPercentage}%` }} />
              ) : null}
              <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${pct}%` }} />
            </div>
            <span>{formatClock(total)}</span>
          </div>
          {session.SupportsRemoteControl && (
            <div className="mt-2 flex gap-1">
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => command.mutate('PlayPause')}
                title={ps.IsPaused ? t('admin.dashboard.resume') : t('common.pause')}
              >
                {ps.IsPaused ? <Play size={14} /> : <Pause size={14} />}
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={() => command.mutate('Stop')} title={t('common.stopPlayback')}>
                <Square size={14} />
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={() => setMessageOpen(true)} title={t('admin.dashboard.sendMessage')}>
                <MessageSquare size={14} />
              </Button>
            </div>
          )}
        </div>
      </div>
      <Modal
        open={messageOpen}
        onClose={() => setMessageOpen(false)}
        title={t('admin.dashboard.messageTo', { name: session.UserName ?? t('admin.dashboard.userFallback') })}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setMessageOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" loading={sendMessage.isPending} disabled={!message.trim()} onClick={() => sendMessage.mutate()}>
              {t('admin.dashboard.send')}
            </Button>
          </>
        }
      >
        <Field label={t('admin.dashboard.messageLabel')}>
          <Input autoFocus value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}

function StorageBar({ label, folder }: { label: string; folder?: FolderStorage }) {
  if (!folder || folder.FreeSpace < 0 || folder.UsedSpace < 0) return null;
  const total = folder.FreeSpace + folder.UsedSpace;
  const pct = total ? (folder.UsedSpace / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between gap-2 text-sm">
        <span className="truncate font-medium">{label}</span>
        <span className="shrink-0 text-muted">
          {t('admin.dashboard.freeOfTotal', { free: formatBytes(folder.FreeSpace), total: formatBytes(total) })}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-white/10">
        <div className={clsx('h-full', pct > 90 ? 'bg-danger' : pct > 75 ? 'bg-star' : 'bg-success')} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 truncate font-mono text-xs text-faint">{folder.Path}</div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value?: number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-base-800/70 p-4 ring-1 ring-white/5">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent">{icon}</div>
      <div>
        <div className="text-xl font-bold tabular-nums">{value != null ? formatNumber(value) : '—'}</div>
        <div className="text-xs text-muted">{label}</div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const api = useApi();
  const toast = useToast();
  const sessions = useSessions();
  const info = useQuery({ queryKey: ['admin', 'sysinfo'], queryFn: () => api.get<SystemInfo>('/System/Info'), refetchInterval: 30_000 });
  const counts = useQuery({ queryKey: ['admin', 'counts'], queryFn: () => api.get<ItemCounts>('/Items/Counts') });
  const storage = useQuery({
    queryKey: ['admin', 'storage'],
    queryFn: () => api.get<SystemStorage>('/System/Info/Storage'),
    retry: false,
  });
  const activity = useQuery({
    queryKey: ['admin', 'activity', 'recent'],
    queryFn: () => api.get<ItemsResult<ActivityLogEntry>>('/System/ActivityLog/Entries', { limit: 8 }),
    refetchInterval: 15_000,
  });
  const tasks = useQuery({
    queryKey: ['admin', 'tasks'],
    queryFn: () => api.get<TaskInfo[]>('/ScheduledTasks', { isHidden: false }),
    refetchInterval: 5000,
  });

  const [confirm, setConfirm] = useState<'restart' | 'shutdown' | null>(null);
  const power = useMutation({
    mutationFn: (action: 'restart' | 'shutdown') => api.post(action === 'restart' ? '/System/Restart' : '/System/Shutdown'),
    onSuccess: (_d, action) => {
      toast.success(action === 'restart' ? t('admin.dashboard.serverIsRestarting') : t('admin.dashboard.serverIsShuttingDown'));
      setConfirm(null);
    },
    onError: (e) => toast.error(e),
  });
  const scanAll = useMutation({
    mutationFn: () => api.post('/Library/Refresh'),
    onSuccess: () => toast.success(t('admin.dashboard.libraryScanStarted')),
    onError: (e) => toast.error(e),
  });

  const allSessions = sessions.data ?? [];
  const playing = allSessions.filter((s) => s.NowPlayingItem);
  const idle = allSessions.filter((s) => !s.NowPlayingItem);
  const running = (tasks.data ?? []).filter((task) => task.State !== 'Idle');
  const sys = info.data;

  return (
    <AdminPage
      wide
      title={t('admin.dashboard.dashboard')}
      actions={
        <>
          <Button icon={<RefreshCw size={16} />} loading={scanAll.isPending} onClick={() => scanAll.mutate()}>
            {t('admin.dashboard.scanAllLibraries')}
          </Button>
          {sys?.CanSelfRestart !== false && (
            <Button icon={<RotateCcw size={16} />} onClick={() => setConfirm('restart')}>
              {t('admin.dashboard.restart')}
            </Button>
          )}
          <Button variant="outline" icon={<Power size={16} />} onClick={() => setConfirm('shutdown')}>
            {t('admin.dashboard.shutDown')}
          </Button>
        </>
      }
    >
      {sys?.HasPendingRestart && (
        <div className="rounded-md bg-star/10 px-4 py-3 text-sm text-star ring-1 ring-star/30">{t('admin.dashboard.restartPending')}</div>
      )}
      {sys?.HasUpdateAvailable && (
        <div className="rounded-md bg-info/10 px-4 py-3 text-sm text-info ring-1 ring-info/30">{t('admin.dashboard.updateAvailable')}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<Film size={18} />} label={t('common.movies')} value={counts.data?.MovieCount} />
        <Stat icon={<Tv size={18} />} label={t('admin.dashboard.shows')} value={counts.data?.SeriesCount} />
        <Stat icon={<Tv size={18} />} label={t('common.episodes')} value={counts.data?.EpisodeCount} />
        <Stat icon={<Music size={18} />} label={t('admin.dashboard.songs')} value={counts.data?.SongCount} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title={playing.length ? t('admin.dashboard.nowPlayingCount', { count: playing.length }) : t('admin.dashboard.nowPlaying')}>
            {playing.length === 0 ? (
              <p className="text-sm text-muted">{t('admin.dashboard.nothingIsPlayingRightNow')}</p>
            ) : (
              <div className="grid gap-4 2xl:grid-cols-2">
                {playing.map((s) => (
                  <NowPlayingCard key={s.Id} session={s} />
                ))}
              </div>
            )}
          </Card>

          <Card title={t('admin.dashboard.activeDevices')}>
            {idle.length === 0 ? (
              <p className="text-sm text-muted">{t('admin.dashboard.noOtherActiveDevices')}</p>
            ) : (
              <div className="divide-y divide-white/5">
                {idle.map((s) => (
                  <div key={s.Id} className="flex items-center gap-3 py-2.5">
                    <Avatar userId={s.UserId ?? ''} name={s.UserName ?? '?'} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{s.UserName ?? t('admin.dashboard.unknownUser')}</div>
                      <div className="truncate text-xs text-muted">
                        {s.Client} {s.ApplicationVersion} · {s.DeviceName}
                        {s.RemoteEndPoint ? ` · ${s.RemoteEndPoint}` : ''}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-faint">{formatRelative(s.LastActivityDate)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            title={t('admin.dashboard.recentActivity')}
            actions={
              <Link to="/admin/activity" className="text-sm text-accent hover:underline">
                {t('admin.dashboard.viewAll')}
              </Link>
            }
          >
            <div className="divide-y divide-white/5">
              {(activity.data?.Items ?? []).map((a) => (
                <div key={a.Id} className="flex items-start gap-3 py-2.5">
                  <span
                    className={clsx(
                      'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                      a.Severity === 'Error' || a.Severity === 'Critical' ? 'bg-danger' : a.Severity === 'Warning' ? 'bg-star' : 'bg-info',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{a.Name}</div>
                    {a.ShortOverview && <div className="truncate text-xs text-muted">{a.ShortOverview}</div>}
                  </div>
                  <span className="shrink-0 text-xs text-faint">{formatRelative(a.Date)}</span>
                </div>
              ))}
              {activity.data?.Items.length === 0 && <p className="text-sm text-muted">{t('admin.dashboard.noActivityYet')}</p>}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title={t('admin.dashboard.server')}>
            {sys ? (
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-faint">{t('common.name')}</dt>
                <dd className="truncate">{sys.ServerName}</dd>
                <dt className="text-faint">{t('admin.dashboard.version')}</dt>
                <dd>{sys.Version}</dd>
                <dt className="text-faint">{t('admin.dashboard.os')}</dt>
                <dd className="truncate">{sys.OperatingSystemDisplayName || sys.OperatingSystem || '—'}</dd>
                {sys.SystemArchitecture && (
                  <>
                    <dt className="text-faint">{t('admin.dashboard.architecture')}</dt>
                    <dd>{sys.SystemArchitecture}</dd>
                  </>
                )}
                {sys.PackageName && (
                  <>
                    <dt className="text-faint">{t('admin.dashboard.package')}</dt>
                    <dd className="truncate">{sys.PackageName}</dd>
                  </>
                )}
                <dt className="text-faint">{t('admin.dashboard.serverId')}</dt>
                <dd className="truncate font-mono text-xs leading-5">{sys.Id}</dd>
              </dl>
            ) : (
              <p className="text-sm text-muted">{t('admin.dashboard.loading')}</p>
            )}
          </Card>

          <Card
            title={t('admin.dashboard.runningTasks')}
            actions={
              <Link to="/admin/tasks" className="text-sm text-accent hover:underline">
                {t('admin.dashboard.allTasks')}
              </Link>
            }
          >
            {running.length === 0 ? (
              <p className="text-sm text-muted">{t('admin.dashboard.noTasksAreRunning')}</p>
            ) : (
              <div className="space-y-3">
                {running.map((task) => (
                  <div key={task.Id}>
                    <div className="flex justify-between text-sm">
                      <span className="truncate">{task.Name}</span>
                      <span className="text-muted tabular-nums">{Math.round(task.CurrentProgressPercentage ?? 0)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded bg-white/10">
                      <div className="h-full bg-accent transition-all" style={{ width: `${task.CurrentProgressPercentage ?? 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {storage.data && (
            <Card title={t('admin.dashboard.storage')} actions={<HardDrive size={18} className="text-faint" />}>
              <div className="space-y-4">
                <StorageBar label={t('admin.dashboard.programData')} folder={storage.data.ProgramDataFolder} />
                <StorageBar label={t('admin.dashboard.cache')} folder={storage.data.CacheFolder} />
                <StorageBar label={t('admin.dashboard.transcodes')} folder={storage.data.TranscodingTempFolder} />
                {storage.data.Libraries?.map((lib) =>
                  lib.Folders.map((f, i) => <StorageBar key={`${lib.Id}-${i}`} label={lib.Name} folder={f} />),
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'restart' ? t('admin.dashboard.restartServer') : t('admin.dashboard.shutDownServer')}
        message={confirm === 'restart' ? t('admin.dashboard.restartWarning') : t('admin.dashboard.jellyfinWillStopAndMust')}
        confirmLabel={confirm === 'restart' ? t('admin.dashboard.restart') : t('admin.dashboard.shutDown')}
        danger={confirm === 'shutdown'}
        loading={power.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && power.mutate(confirm)}
      />
    </AdminPage>
  );
}
