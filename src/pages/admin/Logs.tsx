import clsx from 'clsx';
import { Download, FileText, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LogFile } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Form';
import { PageSpinner, Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { formatBytes, formatDateTime } from '@/lib/format';
import { AdminPage } from './shared';

const MAX_LINES = 5000;

export default function LogsPage() {
  const api = useApi();
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const viewerRef = useRef<HTMLPreElement>(null);

  const files = useQuery({ queryKey: ['admin', 'logs'], queryFn: () => api.get<LogFile[]>('/System/Logs') });
  const sorted = useMemo(
    () => [...(files.data ?? [])].sort((a, b) => new Date(b.DateModified).getTime() - new Date(a.DateModified).getTime()),
    [files.data],
  );

  useEffect(() => {
    if (!selected && sorted[0]) setSelected(sorted[0].Name);
  }, [sorted, selected]);

  const content = useQuery({
    queryKey: ['admin', 'log', selected],
    queryFn: () => api.request<string>('GET', '/System/Logs/Log', { query: { name: selected! }, responseType: 'text' }),
    enabled: Boolean(selected),
  });

  const lines = useMemo(() => {
    const all = (content.data ?? '').split('\n');
    const q = filter.trim().toLowerCase();
    const matched = q ? all.filter((l) => l.toLowerCase().includes(q)) : all;
    return matched.slice(-MAX_LINES);
  }, [content.data, filter]);

  useEffect(() => {
    const el = viewerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const download = () => {
    if (!content.data || !selected) return;
    const url = URL.createObjectURL(new Blob([content.data], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = selected;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminPage wide title="Logs" description="Server log files. The newest lines are at the bottom.">
      {files.isLoading ? (
        <PageSpinner />
      ) : files.error ? (
        <ErrorState error={files.error} onRetry={() => files.refetch()} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="max-h-[70vh] overflow-y-auto rounded-lg bg-base-800/70 p-1 ring-1 ring-white/5">
            {sorted.map((f) => (
              <button
                key={f.Name}
                onClick={() => setSelected(f.Name)}
                className={clsx(
                  'flex w-full items-start gap-2.5 rounded-md px-3 py-2 text-left',
                  selected === f.Name ? 'bg-white/10' : 'hover:bg-white/5',
                )}
              >
                <FileText size={16} className={clsx('mt-0.5 shrink-0', selected === f.Name ? 'text-accent' : 'text-faint')} />
                <div className="min-w-0">
                  <div className="truncate text-sm">{f.Name}</div>
                  <div className="text-xs text-faint">
                    {formatDateTime(f.DateModified)} · {formatBytes(f.Size)}
                  </div>
                </div>
              </button>
            ))}
            {sorted.length === 0 && <p className="p-3 text-sm text-muted">No log files.</p>}
          </div>
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter lines…" className="max-w-xs" />
              <Button size="sm" icon={<RefreshCw size={14} />} onClick={() => content.refetch()} disabled={!selected}>
                Reload
              </Button>
              <Button size="sm" variant="ghost" icon={<Download size={14} />} onClick={download} disabled={!content.data}>
                Download
              </Button>
              {content.isFetching && <Spinner size={16} className="text-accent" />}
            </div>
            <pre
              ref={viewerRef}
              className="h-[65vh] overflow-auto rounded-lg bg-black/50 p-4 font-mono text-xs leading-relaxed whitespace-pre text-fg/85 ring-1 ring-white/5"
            >
              {content.error
                ? String((content.error as Error).message)
                : lines.map((l, i) => (
                    <div
                      key={i}
                      className={clsx(
                        /\[(ERR|FTL)\]|\bError\b/.test(l) && 'text-danger',
                        /\[WRN\]/.test(l) && 'text-star',
                      )}
                    >
                      {l || ' '}
                    </div>
                  ))}
            </pre>
          </div>
        </div>
      )}
    </AdminPage>
  );
}
