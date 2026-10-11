import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ActivityLogEntry, ItemsResult } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { formatDateTime } from '@/lib/format';
import { AdminPage } from './shared';
import { useUsers } from './Users';
import { t } from '@/i18n';

const PAGE = 50;

export default function ActivityPage() {
  const api = useApi();
  const [page, setPage] = useState(0);
  const users = useUsers();
  const userName = (id: string) => users.data?.find((u) => u.Id === id)?.Name;
  const log = useQuery({
    queryKey: ['admin', 'activity', page],
    queryFn: () => api.get<ItemsResult<ActivityLogEntry>>('/System/ActivityLog/Entries', { startIndex: page * PAGE, limit: PAGE }),
    placeholderData: keepPreviousData,
    refetchInterval: page === 0 ? 15_000 : false,
  });

  const total = log.data?.TotalRecordCount ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <AdminPage
      title={t('admin.activity.activity')}
      description={t('admin.activity.aLogOfSignIns')}
      actions={
        <div className="flex items-center gap-2 text-sm text-muted">
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            aria-label={t('admin.activity.previousPage')}
          >
            <ChevronLeft size={18} />
          </Button>
          <span className="tabular-nums">
            {page + 1} / {pages}
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={page + 1 >= pages}
            onClick={() => setPage((p) => p + 1)}
            aria-label={t('admin.activity.nextPage')}
          >
            <ChevronRight size={18} />
          </Button>
        </div>
      }
    >
      {log.isLoading ? (
        <PageSpinner />
      ) : log.error ? (
        <ErrorState error={log.error} onRetry={() => log.refetch()} />
      ) : (
        <div className="overflow-hidden rounded-lg bg-base-800/70 ring-1 ring-white/5">
          <table className="w-full text-sm">
            <thead className="bg-black/20 text-left text-xs tracking-wider text-faint uppercase">
              <tr>
                <th className="px-4 py-2.5 font-semibold">{t('admin.activity.event')}</th>
                <th className="hidden px-4 py-2.5 font-semibold md:table-cell">{t('admin.activity.user')}</th>
                <th className="px-4 py-2.5 text-right font-semibold">{t('admin.activity.date')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {log.data?.Items.map((a) => (
                <tr key={a.Id} className="align-top">
                  <td className="px-4 py-2.5">
                    <div className="flex items-start gap-2.5">
                      <span
                        className={clsx(
                          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                          a.Severity === 'Error' || a.Severity === 'Critical'
                            ? 'bg-danger'
                            : a.Severity === 'Warning'
                              ? 'bg-star'
                              : 'bg-info',
                        )}
                        title={a.Severity}
                      />
                      <div className="min-w-0">
                        <div>{a.Name}</div>
                        {(a.ShortOverview || a.Overview) && (
                          <div className="mt-0.5 text-xs break-words text-muted">{a.ShortOverview || a.Overview}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-2.5 text-muted md:table-cell">
                    {a.UserId && a.UserId !== '00000000000000000000000000000000' ? (userName(a.UserId) ?? '—') : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-muted">{formatDateTime(a.Date)}</td>
                </tr>
              ))}
              {log.data?.Items.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-muted">
                    {t('admin.activity.noActivityRecorded')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </AdminPage>
  );
}
