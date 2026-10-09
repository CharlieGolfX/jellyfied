import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/auth/AuthProvider';
import { useToast } from '@/components/ui/Toast';

export function AdminPage({
  title,
  description,
  actions,
  children,
  wide,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'px-4 py-6 sm:px-8 lg:py-8' : 'mx-auto max-w-5xl px-4 py-6 sm:px-8 lg:py-8'}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="space-y-6">{children}</div>
    </div>
  );
}

export function StatusPill({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'gray' | 'blue'; children: ReactNode }) {
  const tones = {
    green: 'bg-success/15 text-success',
    amber: 'bg-star/15 text-star',
    red: 'bg-danger/15 text-danger',
    gray: 'bg-white/10 text-muted',
    blue: 'bg-info/15 text-info',
  };
  return (
    <span className={`inline-flex shrink-0 items-center rounded px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  );
}

/**
 * Load-and-save helper for Jellyfin's configuration objects. Saving posts the full object back,
 * which is what the server expects.
 */
export function useConfigEditor<T extends Record<string, unknown>>(path: string, label = 'Settings') {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['admin', 'config', path], queryFn: () => api.get<T>(path) });
  const save = useMutation({
    mutationFn: (value: T) => api.post(path, value),
    onSuccess: () => {
      toast.success(`${label} saved`);
      void qc.invalidateQueries({ queryKey: ['admin', 'config', path] });
    },
    onError: (e) => toast.error(e),
  });
  return { query, save };
}

export function parseList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
