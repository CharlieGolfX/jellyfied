import clsx from 'clsx';
import { ImageOff, Search, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MEDIA } from '@/api/queries';
import type { BaseItemDto, ImageType } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import type { ImageInfo, RemoteImage } from './metadataEditorTypes';

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

export function ImagesTab({ item }: { item: BaseItemDto }) {
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
      api.delete(
        img.ImageIndex != null
          ? `/Items/${item.Id}/Images/${img.ImageType}/${img.ImageIndex}`
          : `/Items/${item.Id}/Images/${img.ImageType}`,
      ),
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
                      className={clsx(
                        'rounded-md bg-base-950/60 object-contain ring-1 ring-white/10',
                        landscape ? 'h-28 max-w-64' : 'h-44',
                      )}
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
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--color-accent)]"
            checked={allLanguages}
            onChange={(e) => setAllLanguages(e.target.checked)}
          />
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
        <p className="py-10 text-center text-sm text-faint">
          The server&apos;s metadata providers have no {label.toLowerCase()} images for this item.
        </p>
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
