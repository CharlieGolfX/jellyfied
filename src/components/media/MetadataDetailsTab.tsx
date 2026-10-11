import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MEDIA } from '@/api/queries';
import type { BaseItemDto } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Switch, TextArea } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import type { EditorInfo } from './metadataEditorTypes';

// ---------------------------------------------------------------------------
// Details
// ---------------------------------------------------------------------------

const toList = (value: string) =>
  value
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
const fromNames = (list?: { Name?: string | null }[] | null) =>
  (list ?? [])
    .map((x) => x.Name ?? '')
    .filter(Boolean)
    .join(', ');
export const toNumber = (value: string): number | null => {
  if (value.trim() === '') return null;
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const dateInput = (iso?: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) && !iso.startsWith('0001') ? iso.slice(0, 10) : '');

export function DetailsTab({ item, onSaved }: { item: BaseItemDto & Record<string, unknown>; onSaved: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  const info = useQuery({
    queryKey: ['metadata-editor-info', item.Id],
    queryFn: () => api.get<EditorInfo>(`/Items/${item.Id}/MetadataEditor`),
    staleTime: 5 * 60_000,
  });

  const isMusic = ['Audio', 'MusicAlbum', 'MusicVideo'].includes(item.Type);
  const hasIndex = ['Episode', 'Season', 'Audio'].includes(item.Type);
  const hasParentIndex = ['Episode', 'Audio'].includes(item.Type);

  const [form, setForm] = useState(() => ({
    Name: item.Name ?? '',
    OriginalTitle: item.OriginalTitle ?? '',
    ForcedSortName: (item.ForcedSortName as string | undefined) ?? '',
    Tagline: item.Taglines?.[0] ?? '',
    Overview: item.Overview ?? '',
    ProductionYear: item.ProductionYear != null ? String(item.ProductionYear) : '',
    PremiereDate: dateInput(item.PremiereDate),
    EndDate: dateInput(item.EndDate),
    CommunityRating: item.CommunityRating != null ? String(item.CommunityRating) : '',
    CriticRating: item.CriticRating != null ? String(item.CriticRating) : '',
    OfficialRating: item.OfficialRating ?? '',
    Genres: (item.Genres ?? []).join(', '),
    Tags: (item.Tags ?? []).join(', '),
    Studios: fromNames(item.Studios),
    IndexNumber: item.IndexNumber != null ? String(item.IndexNumber) : '',
    ParentIndexNumber: item.ParentIndexNumber != null ? String(item.ParentIndexNumber) : '',
    Album: item.Album ?? '',
    AlbumArtists: fromNames(item.AlbumArtists),
    Artists: fromNames(item.ArtistItems),
    ProviderIds: { ...item.ProviderIds } as Record<string, string>,
    LockData: Boolean(item.LockData),
  }));
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const text = (
    key:
      | 'Name'
      | 'OriginalTitle'
      | 'ForcedSortName'
      | 'Tagline'
      | 'ProductionYear'
      | 'CommunityRating'
      | 'CriticRating'
      | 'Genres'
      | 'Tags'
      | 'Studios'
      | 'IndexNumber'
      | 'ParentIndexNumber'
      | 'Album'
      | 'AlbumArtists'
      | 'Artists'
      | 'PremiereDate'
      | 'EndDate',
  ) => ({
    value: form[key],
    onChange: (e: { target: { value: string } }) => set(key, e.target.value),
  });

  const save = useMutation({
    mutationFn: () => {
      const providerIds: Record<string, string> = {};
      for (const [k, v] of Object.entries(form.ProviderIds)) if (v.trim()) providerIds[k] = v.trim();
      const body: Record<string, unknown> = {
        ...item,
        Name: form.Name.trim(),
        OriginalTitle: form.OriginalTitle.trim() || null,
        ForcedSortName: form.ForcedSortName.trim() || null,
        Taglines: form.Tagline.trim() ? [form.Tagline.trim()] : [],
        Overview: form.Overview.trim() || null,
        ProductionYear: toNumber(form.ProductionYear),
        PremiereDate: form.PremiereDate ? `${form.PremiereDate}T00:00:00.000Z` : null,
        EndDate: form.EndDate ? `${form.EndDate}T00:00:00.000Z` : null,
        CommunityRating: toNumber(form.CommunityRating),
        CriticRating: toNumber(form.CriticRating),
        OfficialRating: form.OfficialRating || null,
        Genres: toList(form.Genres),
        Tags: toList(form.Tags),
        Studios: toList(form.Studios).map((Name) => ({ Name })),
        ProviderIds: providerIds,
        LockData: form.LockData,
      };
      if (hasIndex) body.IndexNumber = toNumber(form.IndexNumber);
      if (hasParentIndex) body.ParentIndexNumber = toNumber(form.ParentIndexNumber);
      if (isMusic) {
        body.Album = form.Album.trim() || null;
        body.AlbumArtists = toList(form.AlbumArtists).map((Name) => ({ Name }));
        body.ArtistItems = toList(form.Artists).map((Name) => ({ Name }));
      }
      return api.post(`/Items/${item.Id}`, body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [MEDIA] });
      toast.success('Metadata saved');
      onSaved();
    },
    onError: (e) => toast.error(e),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.Name.trim()) {
      toast.error('The title cannot be empty.');
      return;
    }
    save.mutate();
  };

  const ratings = (info.data?.ParentalRatingOptions ?? []).map((r) => r.Name ?? '').filter(Boolean);
  if (form.OfficialRating && !ratings.includes(form.OfficialRating)) ratings.unshift(form.OfficialRating);
  const idInfos = info.data?.ExternalIdInfos ?? [];
  const seenKeys = new Set<string>();
  const idFields = idInfos.filter((i) => (seenKeys.has(i.Key) ? false : (seenKeys.add(i.Key), true)));

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" className="sm:col-span-2">
          <Input {...text('Name')} required />
        </Field>
        <Field label="Original title">
          <Input {...text('OriginalTitle')} />
        </Field>
        <Field label="Sort title" hint="Leave empty to sort by the title.">
          <Input {...text('ForcedSortName')} />
        </Field>
        <Field label="Tagline" className="sm:col-span-2">
          <Input {...text('Tagline')} />
        </Field>
        <Field label="Overview" className="sm:col-span-2">
          <TextArea value={form.Overview} onChange={(e) => set('Overview', e.target.value)} rows={5} />
        </Field>
        <Field label="Year">
          <Input {...text('ProductionYear')} inputMode="numeric" />
        </Field>
        <Field label="Release date">
          <Input type="date" {...text('PremiereDate')} />
        </Field>
        {item.Type === 'Series' && (
          <Field label="End date">
            <Input type="date" {...text('EndDate')} />
          </Field>
        )}
        {hasParentIndex && (
          <Field label={item.Type === 'Episode' ? 'Season number' : 'Disc number'}>
            <Input {...text('ParentIndexNumber')} inputMode="numeric" />
          </Field>
        )}
        {hasIndex && (
          <Field label={item.Type === 'Episode' ? 'Episode number' : item.Type === 'Season' ? 'Season number' : 'Track number'}>
            <Input {...text('IndexNumber')} inputMode="numeric" />
          </Field>
        )}
        <Field label="Community rating" hint="0 to 10">
          <Input {...text('CommunityRating')} inputMode="decimal" />
        </Field>
        <Field label="Critic rating" hint="0 to 100">
          <Input {...text('CriticRating')} inputMode="decimal" />
        </Field>
        <Field label="Parental rating">
          <Select value={form.OfficialRating} onChange={(e) => set('OfficialRating', e.target.value)}>
            <option value="">None</option>
            {ratings.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Studios" hint="Separate with commas.">
          <Input {...text('Studios')} />
        </Field>
        <Field label="Genres" hint="Separate with commas." className="sm:col-span-2">
          <Input {...text('Genres')} />
        </Field>
        <Field label="Tags" hint="Separate with commas." className="sm:col-span-2">
          <Input {...text('Tags')} />
        </Field>
        {isMusic && (
          <>
            <Field label="Album">
              <Input {...text('Album')} />
            </Field>
            <Field label="Album artists" hint="Separate with commas.">
              <Input {...text('AlbumArtists')} />
            </Field>
            <Field label="Artists" hint="Separate with commas." className="sm:col-span-2">
              <Input {...text('Artists')} />
            </Field>
          </>
        )}
      </div>

      {idFields.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted">External IDs</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {idFields.map((i) => (
              <Field key={i.Key} label={`${i.Name}${i.Type && i.Type !== item.Type ? ` (${i.Type})` : ''}`}>
                <Input
                  value={form.ProviderIds[i.Key] ?? ''}
                  onChange={(e) => set('ProviderIds', { ...form.ProviderIds, [i.Key]: e.target.value })}
                />
              </Field>
            ))}
          </div>
        </div>
      )}

      <Switch
        label="Lock this item"
        description="Prevents library scans and metadata refreshes from changing it."
        checked={form.LockData}
        onChange={(v) => set('LockData', v)}
      />

      <div className="sticky -bottom-4 -mx-5 -mb-4 flex justify-end gap-2 border-t border-white/10 bg-base-800 px-5 py-3">
        <Button variant="ghost" onClick={onSaved}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}
