import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '@/api/client';
import type { BaseItemDto, ItemsResult, MediaSegment } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Form';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { ticksToSeconds } from '@/lib/format';
import { draftProblem, SEGMENT_TYPES, toDraft, toSegments, type EditableSegmentType, type SegmentDraft } from './segmentEditing';
import { t } from '@/i18n';

/**
 * The segments of a video (intro, credits, recap, preview, commercial), which the player offers to
 * skip. Jellyfin itself can only list them; changing them goes through the Intro Skipper plugin's
 * segment editor API, so without it this tab only shows them. Its 12.x versions replace all of an
 * item's segments at once (PUT, guarded by the revision read); the 10.11 ones only add and delete
 * one at a time.
 */
interface EditorState {
  mode: 'replace' | 'oneByOne' | 'readOnly';
  /** The revision the segments were read at (replace only). */
  etag: string | null;
  segments: MediaSegment[];
}

export function SegmentsTab({ item }: { item: BaseItemDto }) {
  const api = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  const duration = item.RunTimeTicks ? ticksToSeconds(item.RunTimeTicks) : undefined;

  /** The segments, and how they can be changed: all at once, one at a time, or not at all. */
  const current = useQuery({
    queryKey: ['segment-editor', item.Id],
    staleTime: 0,
    gcTime: 0,
    queryFn: async (): Promise<EditorState> => {
      let etag: string | null = null;
      try {
        const segments = await api.request<MediaSegment[]>('GET', `/MediaSegmentsApi/${item.Id}`, {
          onResponse: (r) => (etag = r.headers.get('ETag')),
        });
        return { mode: 'replace', etag, segments };
      } catch (err) {
        // 404: no plugin, or one that doesn't handle this item. 405: the plugin for 10.11.
        if (!(err instanceof ApiError) || (err.status !== 404 && err.status !== 405)) throw err;
        const listed = await api.get<ItemsResult<MediaSegment>>(`/MediaSegments/${item.Id}`);
        return { mode: err.status === 405 ? 'oneByOne' : 'readOnly', etag: null, segments: listed.Items };
      }
    },
  });

  const [drafts, setDrafts] = useState<SegmentDraft[] | null>(null);
  const [shown, setShown] = useState<unknown>(null);
  // Start over from the server's copy whenever a new one arrives.
  if (current.data && current.data !== shown) {
    setShown(current.data);
    setDrafts([...current.data.segments].sort((a, b) => a.StartTicks - b.StartTicks).map(toDraft));
  }

  const save = useMutation({
    mutationFn: async (rows: SegmentDraft[]): Promise<EditorState> => {
      const wanted = toSegments(rows);
      if (current.data?.mode === 'oneByOne') {
        // Delete what is gone or changed, then add what is new or changed.
        const same = (a: Omit<MediaSegment, 'Id' | 'ItemId'>, b: Omit<MediaSegment, 'Id' | 'ItemId'>) =>
          a.Type === b.Type && a.StartTicks === b.StartTicks && a.EndTicks === b.EndTicks;
        const before = current.data.segments;
        for (const old of before.filter((b) => !wanted.some((w) => same(w, b)))) {
          await api.delete(`/MediaSegmentsApi/${old.Id}`, { itemId: item.Id, type: old.Type });
        }
        for (const add of wanted.filter((w) => !before.some((b) => same(w, b)))) {
          await api.post(
            `/MediaSegmentsApi/${item.Id}`,
            { ItemId: item.Id, Type: add.Type, StartTicks: add.StartTicks, EndTicks: add.EndTicks },
            { providerId: 'IntroSkipper' },
          );
        }
        const listed = await api.get<ItemsResult<MediaSegment>>(`/MediaSegments/${item.Id}`);
        return { mode: 'oneByOne', etag: null, segments: listed.Items };
      }
      let etag: string | null = null;
      const segments = await api.request<MediaSegment[]>('PUT', `/MediaSegmentsApi/${item.Id}`, {
        body: wanted,
        headers: { 'If-Match': current.data?.etag ?? '*' },
        onResponse: (r) => (etag = r.headers.get('ETag')),
      });
      return { mode: 'replace', etag, segments: segments ?? [] };
    },
    onSuccess: (saved) => {
      toast.success(t('media.segments.saved'));
      // What the server stored, with its new revision: the rows start over from it.
      qc.setQueryData(['segment-editor', item.Id], saved);
      // The player's skip buttons read them from here.
      void qc.invalidateQueries({ queryKey: ['segments', item.Id] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 412) {
        toast.error(t('media.segments.changedElsewhere'));
        void current.refetch();
      } else toast.error(err);
    },
  });

  if (current.isLoading || !drafts) {
    return (
      <div className="flex justify-center py-12 text-accent">
        <Spinner size={28} />
      </div>
    );
  }
  if (current.error || !current.data) return <ErrorState error={current.error} onRetry={() => current.refetch()} />;

  const editable = current.data.mode !== 'readOnly';
  const problems = drafts.map((d) => draftProblem(d, duration));
  const update = (i: number, change: Partial<SegmentDraft>) => setDrafts(drafts.map((d, j) => (j === i ? { ...d, ...change } : d)));

  return (
    <div className="space-y-4" data-testid="segments-tab">
      <p className="text-sm text-muted">{editable ? t('media.segments.hint') : t('media.segments.readOnly')}</p>
      {drafts.length === 0 ? (
        <p className="rounded-md bg-base-900/60 px-3 py-4 text-center text-sm text-faint">{t('media.segments.none')}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-2 font-medium">{t('media.segments.type')}</th>
              <th className="pb-2 font-medium">{t('media.segments.start')}</th>
              <th className="pb-2 font-medium">{t('media.segments.end')}</th>
              {editable && <th className="sr-only pb-2">{t('media.segments.remove')}</th>}
            </tr>
          </thead>
          <tbody>
            {drafts.map((d, i) => (
              <tr key={i} className="align-top">
                <td className="py-1 pr-2">
                  {editable ? (
                    <select
                      value={d.type}
                      onChange={(e) => update(i, { type: e.target.value as EditableSegmentType })}
                      aria-label={t('media.segments.type')}
                      className="h-9 w-full rounded-md bg-base-900 px-2 ring-1 ring-white/10"
                    >
                      {SEGMENT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {t(`media.segments.types.${type}`)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    t(`media.segments.types.${d.type}`)
                  )}
                </td>
                {(['start', 'end'] as const).map((field) => (
                  <td key={field} className="py-1 pr-2">
                    {editable ? (
                      <Input
                        value={d[field]}
                        onChange={(e) => update(i, { [field]: e.target.value })}
                        aria-label={t(`media.segments.${field}`)}
                        aria-invalid={Boolean(problems[i])}
                        inputMode="decimal"
                        placeholder="0:00"
                        className="tabular-nums"
                      />
                    ) : (
                      <span className="tabular-nums">{d[field]}</span>
                    )}
                    {field === 'end' && problems[i] && (
                      <p className="mt-1 text-xs text-danger">{t(`media.segments.problem.${problems[i]}`)}</p>
                    )}
                  </td>
                ))}
                {editable && (
                  <td className="w-10 py-1">
                    <button
                      onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}
                      className="rounded p-2 text-muted hover:bg-white/10 hover:text-fg"
                      aria-label={t('media.segments.remove')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editable && (
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => setDrafts([...drafts, { type: 'Intro', start: '', end: '' }])}
          >
            {t('media.segments.add')}
          </Button>
          <Button variant="primary" onClick={() => save.mutate(drafts)} loading={save.isPending} disabled={problems.some(Boolean)}>
            {t('common.save')}
          </Button>
        </div>
      )}
    </div>
  );
}
