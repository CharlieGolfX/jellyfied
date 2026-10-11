import { Play, Square } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TaskInfo } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { formatRelative } from '@/lib/format';
import { Card } from '@/pages/Settings';
import { AdminPage, StatusPill } from './shared';
import { t } from '@/i18n';

function duration(start?: string, end?: string): string {
  if (!start || !end) return '';
  const s = (new Date(end).getTime() - new Date(start).getTime()) / 1000;
  if (!Number.isFinite(s) || s < 0) return '';
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${(s / 3600).toFixed(1)} h`;
}

function TaskRow({ task }: { task: TaskInfo }) {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();
  const run = useMutation({
    mutationFn: () => api.post(`/ScheduledTasks/Running/${task.Id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'tasks'] }),
    onError: (e) => toast.error(e),
  });
  const stop = useMutation({
    mutationFn: () => api.delete(`/ScheduledTasks/Running/${task.Id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'tasks'] }),
    onError: (e) => toast.error(e),
  });
  const last = task.LastExecutionResult;
  const runningNow = task.State === 'Running' || task.State === 'Cancelling';

  return (
    <div className="flex items-center gap-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{task.Name}</span>
          {last?.Status === 'Failed' && <StatusPill tone="red">{t('admin.tasks.failed')}</StatusPill>}
          {last?.Status === 'Cancelled' && <StatusPill tone="gray">{t('admin.tasks.cancelled')}</StatusPill>}
        </div>
        {task.Description && <div className="truncate text-sm text-muted">{task.Description}</div>}
        {runningNow ? (
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 max-w-xs flex-1 overflow-hidden rounded bg-white/10">
              <div className="h-full bg-accent transition-all" style={{ width: `${task.CurrentProgressPercentage ?? 0}%` }} />
            </div>
            <span className="text-xs text-muted tabular-nums">
              {task.State === 'Cancelling' ? t('admin.tasks.stopping') : `${Math.round(task.CurrentProgressPercentage ?? 0)}%`}
            </span>
          </div>
        ) : (
          <div className="mt-0.5 text-xs text-faint">
            {last?.EndTimeUtc
              ? duration(last.StartTimeUtc, last.EndTimeUtc)
                ? t('admin.tasks.lastRanTook', {
                    when: formatRelative(last.EndTimeUtc),
                    took: duration(last.StartTimeUtc, last.EndTimeUtc),
                  })
                : t('admin.tasks.lastRan', { when: formatRelative(last.EndTimeUtc) })
              : t('admin.tasks.neverRun')}
            {last?.Status === 'Failed' && last.ErrorMessage ? ` — ${last.ErrorMessage}` : ''}
          </div>
        )}
      </div>
      {runningNow ? (
        <Button
          size="sm"
          variant="outline"
          icon={<Square size={14} />}
          loading={stop.isPending}
          disabled={task.State === 'Cancelling'}
          onClick={() => stop.mutate()}
        >
          {t('admin.tasks.stop')}
        </Button>
      ) : (
        <Button size="sm" icon={<Play size={14} />} loading={run.isPending} onClick={() => run.mutate()}>
          {t('admin.tasks.run')}
        </Button>
      )}
    </div>
  );
}

export default function TasksPage() {
  const api = useApi();
  const tasks = useQuery({
    queryKey: ['admin', 'tasks'],
    queryFn: () => api.get<TaskInfo[]>('/ScheduledTasks', { isHidden: false }),
    refetchInterval: (q) => ((q.state.data ?? []).some((entry) => entry.State !== 'Idle') ? 1500 : 10_000),
  });

  if (tasks.isLoading) return <PageSpinner />;
  if (tasks.error) return <ErrorState error={tasks.error} onRetry={() => tasks.refetch()} />;

  const groups = new Map<string, TaskInfo[]>();
  for (const entry of tasks.data ?? []) {
    const key = entry.Category || t('admin.tasks.otherCategory');
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  return (
    <AdminPage title={t('admin.tasks.scheduledTasks')} description={t('admin.tasks.maintenanceJobsThatJellyfinRuns')}>
      {[...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([category, list]) => (
          <Card key={category} title={category}>
            <div className="-my-3 divide-y divide-white/5">
              {list
                .sort((a, b) => a.Name.localeCompare(b.Name))
                .map((entry) => (
                  <TaskRow key={entry.Id} task={entry} />
                ))}
            </div>
          </Card>
        ))}
    </AdminPage>
  );
}
