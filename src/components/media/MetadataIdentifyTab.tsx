import { Search } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MEDIA } from '@/api/queries';
import type { BaseItemDto } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { toNumber } from './MetadataDetailsTab';
import type { RemoteSearchResult } from './metadataEditorTypes';
import { t } from '@/i18n';

// ---------------------------------------------------------------------------
// Identify
// ---------------------------------------------------------------------------

export function IdentifyTab({ item, onApplied }: { item: BaseItemDto; onApplied: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(item.Name ?? '');
  const [year, setYear] = useState(item.ProductionYear != null ? String(item.ProductionYear) : '');
  const [results, setResults] = useState<RemoteSearchResult[] | null>(null);
  const [replaceImages, setReplaceImages] = useState(true);

  const search = useMutation({
    mutationFn: () =>
      api.post<RemoteSearchResult[]>(`/Items/RemoteSearch/${item.Type}`, {
        SearchInfo: { Name: name.trim(), Year: toNumber(year) ?? undefined, ProviderIds: {} },
        ItemId: item.Id,
        IncludeDisabledProviders: true,
      }),
    onSuccess: (r) => setResults(r ?? []),
    onError: (e) => toast.error(e),
  });

  const apply = useMutation({
    mutationFn: (result: RemoteSearchResult) =>
      api.post(`/Items/RemoteSearch/Apply/${item.Id}`, result, { replaceAllImages: replaceImages }),
    onSuccess: () => {
      toast.success(t('media.metadataIdentifyTab.itemIdentifiedItsMetadataIs'));
      // The server refreshes the item in the background; pick the changes up shortly after.
      window.setTimeout(() => void qc.invalidateQueries({ queryKey: [MEDIA] }), 2500);
      void qc.invalidateQueries({ queryKey: [MEDIA] });
      onApplied();
    },
    onError: (e) => toast.error(e),
  });

  // Search right away with the current title, like the Jellyfin web client does.
  const started = useRef(false);
  const { mutate: runSearch } = search;
  useEffect(() => {
    if (started.current || !name.trim()) return;
    started.current = true;
    runSearch();
  }, [runSearch, name]);

  let body: ReactNode;
  if (search.isPending) {
    body = (
      <div className="flex justify-center py-16 text-accent">
        <Spinner size={32} />
      </div>
    );
  } else if (results && results.length === 0) {
    body = <p className="py-10 text-center text-sm text-faint">{t('media.metadataIdentifyTab.noMatchesFoundTryA')}</p>;
  } else if (results) {
    body = (
      <div className="grid gap-3 sm:grid-cols-2">
        {results.map((r, i) => (
          <button
            key={`${r.SearchProviderName}-${r.Name}-${r.ProductionYear}-${i}`}
            disabled={apply.isPending}
            onClick={() => apply.mutate(r)}
            data-testid="identify-result"
            className="flex gap-3 rounded-md bg-base-950/40 p-2 text-left ring-1 ring-white/10 transition hover:ring-2 hover:ring-accent disabled:opacity-50"
          >
            <div className="h-28 w-[4.7rem] shrink-0 overflow-hidden rounded bg-base-750">
              {r.ImageUrl && <img src={r.ImageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{r.Name}</div>
              <div className="text-xs text-muted">{[r.ProductionYear, r.SearchProviderName].filter(Boolean).join(' · ')}</div>
              {r.Overview && <p className="mt-1 line-clamp-3 text-xs text-faint">{r.Overview}</p>}
            </div>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t('media.metadataIdentifyTab.searchTheServerSMetadata')}</p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) search.mutate();
        }}
      >
        <Field label={t('common.title')} className="min-w-48 flex-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('common.year')} className="w-28">
          <Input value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" />
        </Field>
        <Button type="submit" variant="primary" icon={<Search size={16} />} disabled={!name.trim()} loading={search.isPending}>
          {t('common.search')}
        </Button>
      </form>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--color-accent)]"
          checked={replaceImages}
          onChange={(e) => setReplaceImages(e.target.checked)}
        />
        {t('media.metadataIdentifyTab.alsoReplaceTheExistingImages')}
      </label>
      {apply.isPending && <p className="text-sm text-muted">{t('media.metadataIdentifyTab.applyingMatch')}</p>}
      {body}
    </div>
  );
}
