import clsx from 'clsx';
import { ImageOff, Search, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MEDIA } from '@/api/queries';
import type { BaseItemDto, ImageType } from '@/api/types';
import { useApi, useSession } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Switch, TextArea } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

/** Item types the server can look up with its metadata providers ("Identify"). */
const IDENTIFY_TYPES = new Set(['Movie', 'Series', 'BoxSet', 'MusicAlbum', 'MusicArtist', 'MusicVideo', 'Person', 'Book', 'Trailer']);

interface EditorInfo {
  ParentalRatingOptions?: { Name?: string | null }[];
  ExternalIdInfos?: { Name: string; Key: string; Type?: string | null }[];
}

interface ImageInfo {
  ImageType: ImageType;
  ImageIndex?: number | null;
  ImageTag?: string | null;
  Width?: number | null;
  Height?: number | null;
}

interface RemoteImage {
  ProviderName?: string | null;
  Url: string;
  ThumbnailUrl?: string | null;
  Width?: number | null;
  Height?: number | null;
  Language?: string | null;
  CommunityRating?: number | null;
}

interface RemoteSearchResult {
  Name?: string | null;
  ProductionYear?: number | null;
  ImageUrl?: string | null;
  SearchProviderName?: string | null;
  Overview?: string | null;
  ProviderIds?: Record<string, string>;
}

type Tab = 'details' | 'images' | 'identify';

/** Metadata editor for administrators: text fields, artwork, and re-identifying an item. */
export default function MetadataEditor({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const api = useApi();
  const { userId } = useSession();
  const [tab, setTab] = useState<Tab>('details');

  // Always edit a fresh, complete copy: list views only carry a subset of the fields. It is loaded
  // once per time the editor is opened and never refreshed behind the form, which would throw away
  // what has been typed.
  const item = useQuery({
    queryKey: ['metadata-editor', itemId],
    queryFn: () => api.get<BaseItemDto & Record<string, unknown>>(`/Items/${itemId}`, { userId }),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: 'details', label: 'Details' },
    { id: 'images', label: 'Images' },
  ];
  if (item.data && IDENTIFY_TYPES.has(item.data.Type)) tabs.push({ id: 'identify', label: 'Identify' });

  return (
    <Modal open onClose={onClose} size="xl" title={item.data ? `Edit metadata: ${item.data.Name ?? ''}` : 'Edit metadata'}>
      {item.isLoading ? (
        <div className="flex justify-center py-16 text-accent">
          <Spinner size={32} />
        </div>
      ) : item.error || !item.data ? (
        <ErrorState error={item.error} onRetry={() => item.refetch()} />
      ) : (
        <>
          <div className="mb-5 flex gap-1 border-b border-white/10" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={clsx(
                  '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                  tab === t.id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* Stays mounted, so switching to another tab and back keeps what has been typed. */}
          <div hidden={tab !== 'details'}>
            <DetailsTab item={item.data} onSaved={onClose} />
          </div>
          {tab === 'images' && <ImagesTab item={item.data} />}
          {tab === 'identify' && <IdentifyTab item={item.data} onApplied={onClose} />}
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Details
// ---------------------------------------------------------------------------

const toList = (value: string) =>
  value
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
const fromNames = (list?: { Name?: string | null }[] | null) => (list ?? []).map((x) => x.Name ?? '').filter(Boolean).join(', ');
const toNumber = (value: string): number | null => {
  if (value.trim() === '') return null;
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const dateInput = (iso?: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) && !iso.startsWith('0001') ? iso.slice(0, 10) : '');

function DetailsTab({ item, onSaved }: { item: BaseItemDto & Record<string, unknown>; onSaved: () => void }) {
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
    ProviderIds: { ...(item.ProviderIds ?? {}) } as Record<string, string>,
    LockData: Boolean(item.LockData),
  }));
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const text = (key: 'Name' | 'OriginalTitle' | 'ForcedSortName' | 'Tagline' | 'ProductionYear' | 'CommunityRating' | 'CriticRating' | 'Genres' | 'Tags' | 'Studios' | 'IndexNumber' | 'ParentIndexNumber' | 'Album' | 'AlbumArtists' | 'Artists' | 'PremiereDate' | 'EndDate') => ({
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

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

const IMAGE_TYPES: { type: ImageType; label: string; landscape: boolean }[] = [
  { type: 'Primary', label: 'Poster', landscape: false },
  { type: 'Backdrop', label: 'Backdrop', landscape: true },
  { type: 'Logo', label: 'Logo', landscape: true },
  { type: 'Thumb', label: 'Thumbnail', landscape: true },
  { type: 'Banner', label: 'Banner', landscape: true },
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

function ImagesTab({ item }: { item: BaseItemDto }) {
  const api = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadType = useRef<ImageType>('Primary');
  const [searching, setSearching] = useState<ImageType | null>(null);

  const images = useQuery({
    queryKey: ['metadata-editor-images', item.Id],
    queryFn: () => api.get<ImageInfo[]>(`/Items/${item.Id}/Images`),
    staleTime: 0,
  });

  const changed = () => {
    void images.refetch();
    void qc.invalidateQueries({ queryKey: [MEDIA] });
  };

  const upload = useMutation({
    mutationFn: async ({ type, file }: { type: ImageType; file: File }) =>
      api.request('POST', `/Items/${item.Id}/Images/${type}`, {
        rawBody: { data: await fileToBase64(file), contentType: file.type || 'image/jpeg' },
      }),
    onSuccess: () => {
      toast.success('Image uploaded');
      changed();
    },
    onError: (e) => toast.error(e),
  });

  const remove = useMutation({
    mutationFn: (img: ImageInfo) =>
      api.delete(img.ImageIndex != null ? `/Items/${item.Id}/Images/${img.ImageType}/${img.ImageIndex}` : `/Items/${item.Id}/Images/${img.ImageType}`),
    onSuccess: () => {
      toast.success('Image removed');
      changed();
    },
    onError: (e) => toast.error(e),
  });

  if (searching) {
    return (
      <RemoteImagePicker
        item={item}
        type={searching}
        label={IMAGE_TYPES.find((t) => t.type === searching)?.label ?? searching}
        onBack={() => setSearching(null)}
        onPicked={() => {
          setSearching(null);
          changed();
        }}
      />
    );
  }

  if (images.isLoading) {
    return (
      <div className="flex justify-center py-16 text-accent">
        <Spinner size={32} />
      </div>
    );
  }
  if (images.error) return <ErrorState error={images.error} onRetry={() => images.refetch()} />;

  return (
    <div className="space-y-6">
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        data-testid="image-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) upload.mutate({ type: uploadType.current, file });
        }}
      />
      {IMAGE_TYPES.map(({ type, label, landscape }) => {
        const current = (images.data ?? []).filter((i) => i.ImageType === type);
        return (
          <section key={type} data-image-type={type}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="mr-auto text-sm font-semibold">{label}</h3>
              <Button size="sm" variant="ghost" icon={<Search size={14} />} onClick={() => setSearching(type)}>
                Find online
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Upload size={14} />}
                loading={upload.isPending && upload.variables?.type === type}
                onClick={() => {
                  uploadType.current = type;
                  fileInput.current?.click();
                }}
              >
                Upload
              </Button>
            </div>
            {current.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md bg-base-950/40 px-3 py-4 text-sm text-faint">
                <ImageOff size={16} /> No {label.toLowerCase()} image
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {current.map((img) => (
                  <figure key={`${img.ImageIndex ?? 0}-${img.ImageTag}`} className="group/img relative">
                    <img
                      src={api.imageUrl(item.Id, type, { index: img.ImageIndex ?? undefined, tag: img.ImageTag, maxWidth: 480 })}
                      alt={label}
                      className={clsx('rounded-md bg-base-950/60 object-contain ring-1 ring-white/10', landscape ? 'h-28 max-w-64' : 'h-44')}
                    />
                    <figcaption className="mt-1 text-xs text-faint tabular-nums">
                      {img.Width && img.Height ? `${img.Width}×${img.Height}` : ''}
                    </figcaption>
                    <button
                      onClick={() => remove.mutate(img)}
                      disabled={remove.isPending}
                      aria-label={`Delete ${label.toLowerCase()} image`}
                      title="Delete image"
                      className="absolute top-1.5 right-1.5 rounded-full bg-black/70 p-1.5 text-white opacity-0 transition-opacity group-hover/img:opacity-100 hover:bg-danger focus:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </figure>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function RemoteImagePicker({
  item,
  type,
  label,
  onBack,
  onPicked,
}: {
  item: BaseItemDto;
  type: ImageType;
  label: string;
  onBack: () => void;
  onPicked: () => void;
}) {
  const api = useApi();
  const toast = useToast();
  const [allLanguages, setAllLanguages] = useState(false);
  const remote = useQuery({
    queryKey: ['metadata-editor-remote-images', item.Id, type, allLanguages],
    queryFn: () =>
      api.get<{ Images: RemoteImage[] }>(`/Items/${item.Id}/RemoteImages`, { type, limit: 60, includeAllLanguages: allLanguages }),
    staleTime: 60_000,
    retry: false,
  });
  const download = useMutation({
    mutationFn: (img: RemoteImage) => api.post(`/Items/${item.Id}/RemoteImages/Download`, undefined, { type, imageUrl: img.Url }),
    onSuccess: () => {
      toast.success('Image saved');
      onPicked();
    },
    onError: (e) => toast.error(e),
  });
  const list = remote.data?.Images ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" onClick={onBack}>
          Back
        </Button>
        <h3 className="mr-auto text-sm font-semibold">Find a {label.toLowerCase()} image online</h3>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" className="h-4 w-4 accent-[var(--color-accent)]" checked={allLanguages} onChange={(e) => setAllLanguages(e.target.checked)} />
          All languages
        </label>
      </div>
      {remote.isLoading ? (
        <div className="flex justify-center py-16 text-accent">
          <Spinner size={32} />
        </div>
      ) : remote.error ? (
        <ErrorState error={remote.error} onRetry={() => remote.refetch()} />
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-sm text-faint">The server&apos;s metadata providers have no {label.toLowerCase()} images for this item.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {list.map((img) => (
            <button
              key={img.Url}
              disabled={download.isPending}
              onClick={() => download.mutate(img)}
              data-testid="remote-image"
              className="group/remote overflow-hidden rounded-md bg-base-950/60 text-left ring-1 ring-white/10 transition hover:ring-2 hover:ring-accent disabled:opacity-50"
            >
              <img src={img.ThumbnailUrl || img.Url} alt="" loading="lazy" className="aspect-video w-full object-contain" />
              <div className="px-2 py-1.5 text-xs text-muted">
                <div className="truncate">{img.ProviderName}</div>
                <div className="text-faint tabular-nums">
                  {[img.Width && img.Height ? `${img.Width}×${img.Height}` : '', img.Language ?? ''].filter(Boolean).join(' · ')}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {download.isPending && <p className="mt-3 text-sm text-muted">Downloading image…</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Identify
// ---------------------------------------------------------------------------

function IdentifyTab({ item, onApplied }: { item: BaseItemDto; onApplied: () => void }) {
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
    mutationFn: (result: RemoteSearchResult) => api.post(`/Items/RemoteSearch/Apply/${item.Id}`, result, { replaceAllImages: replaceImages }),
    onSuccess: () => {
      toast.success('Item identified. Its metadata is being refreshed.');
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
    body = <p className="py-10 text-center text-sm text-faint">No matches found. Try a different title or leave the year empty.</p>;
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
      <p className="text-sm text-muted">
        Search the server&apos;s metadata providers and pick the right match. The item&apos;s metadata is then replaced with the
        match.
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) search.mutate();
        }}
      >
        <Field label="Title" className="min-w-48 flex-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Year" className="w-28">
          <Input value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" />
        </Field>
        <Button type="submit" variant="primary" icon={<Search size={16} />} disabled={!name.trim()} loading={search.isPending}>
          Search
        </Button>
      </form>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" className="h-4 w-4 accent-[var(--color-accent)]" checked={replaceImages} onChange={(e) => setReplaceImages(e.target.checked)} />
        Also replace the existing images
      </label>
      {apply.isPending && <p className="text-sm text-muted">Applying match…</p>}
      {body}
    </div>
  );
}
