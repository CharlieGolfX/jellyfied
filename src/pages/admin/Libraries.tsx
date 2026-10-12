import { FolderPlus, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CollectionType, VirtualFolderInfo } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { LibraryIcon } from '@/components/layout/libraryIcon';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Form';
import { Menu } from '@/components/ui/Menu';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageSpinner } from '@/components/ui/Spinner';
import { EmptyState, ErrorState, Img } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { MEDIA } from '@/api/queries';
import { AdminPage } from './shared';
import { FolderPicker } from './FolderPicker';
import { t, tRich } from '@/i18n';

const TYPES: { value: string; label: string }[] = [
  { value: 'movies', label: t('common.movies') },
  { value: 'tvshows', label: t('admin.libraries.shows') },
  { value: 'music', label: t('admin.libraries.music') },
  { value: 'musicvideos', label: t('admin.libraries.musicVideos') },
  { value: 'homevideos', label: t('admin.libraries.homeVideosPhotos') },
  { value: 'books', label: t('admin.libraries.books') },
  { value: 'boxsets', label: t('common.collections') },
  { value: 'mixed', label: t('admin.libraries.mixedMoviesShows') },
];

function typeLabel(type?: CollectionType | null | string): string {
  return TYPES.find((x) => x.value === type)?.label ?? (type ? type : t('admin.libraries.mixedContent'));
}

function useLibraries() {
  const api = useApi();
  return useQuery({
    queryKey: ['admin', 'virtualfolders'],
    queryFn: () => api.get<VirtualFolderInfo[]>('/Library/VirtualFolders'),
    refetchInterval: (q) => ((q.state.data ?? []).some((l) => l.RefreshStatus === 'Active') ? 2000 : 15_000),
  });
}

export default function LibrariesPage() {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();
  const libraries = useLibraries();
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<VirtualFolderInfo | null>(null);
  const [deleting, setDeleting] = useState<VirtualFolderInfo | null>(null);
  const [pickerFor, setPickerFor] = useState<VirtualFolderInfo | null>(null);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'virtualfolders'] });
    void qc.invalidateQueries({ queryKey: [MEDIA, 'views'] });
  };

  const scanAll = useMutation({
    mutationFn: () => api.post('/Library/Refresh'),
    onSuccess: () => {
      toast.success(t('admin.libraries.scanningAllLibraries'));
      invalidate();
    },
    onError: (e) => toast.error(e),
  });

  const refresh = useMutation({
    mutationFn: ({ lib, full }: { lib: VirtualFolderInfo; full: boolean }) =>
      api.post(`/Items/${lib.ItemId}/Refresh`, undefined, {
        Recursive: true,
        MetadataRefreshMode: full ? 'FullRefresh' : 'Default',
        ImageRefreshMode: full ? 'FullRefresh' : 'Default',
        ReplaceAllMetadata: full,
        ReplaceAllImages: full,
      }),
    onSuccess: (_d, { lib, full }) => {
      toast.success(
        full ? t('admin.libraries.refreshingMetadata', { name: lib.Name }) : t('admin.libraries.scanningLibrary', { name: lib.Name }),
      );
      invalidate();
    },
    onError: (e) => toast.error(e),
  });

  const remove = useMutation({
    mutationFn: (lib: VirtualFolderInfo) => api.delete('/Library/VirtualFolders', { name: lib.Name, refreshLibrary: true }),
    onSuccess: () => {
      toast.success(t('admin.libraries.libraryRemoved'));
      setDeleting(null);
      invalidate();
    },
    onError: (e) => toast.error(e),
  });

  const addPath = useMutation({
    mutationFn: ({ lib, path }: { lib: VirtualFolderInfo; path: string }) =>
      api.post('/Library/VirtualFolders/Paths', { Name: lib.Name, PathInfo: { Path: path } }, { refreshLibrary: true }),
    onSuccess: () => {
      toast.success(t('admin.libraries.folderAdded'));
      invalidate();
    },
    onError: (e) => toast.error(e),
  });

  const removePath = useMutation({
    mutationFn: ({ lib, path }: { lib: VirtualFolderInfo; path: string }) =>
      api.delete('/Library/VirtualFolders/Paths', { name: lib.Name, path, refreshLibrary: true }),
    onSuccess: () => {
      toast.success(t('admin.libraries.folderRemoved'));
      invalidate();
    },
    onError: (e) => toast.error(e),
  });

  return (
    <AdminPage
      title={t('admin.libraries.libraries')}
      description={t('admin.libraries.description')}
      actions={
        <>
          <Button icon={<RefreshCw size={16} />} loading={scanAll.isPending} onClick={() => scanAll.mutate()}>
            {t('admin.libraries.scanAll')}
          </Button>
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAdding(true)}>
            {t('admin.libraries.addLibrary')}
          </Button>
        </>
      }
    >
      {libraries.isLoading ? (
        <PageSpinner />
      ) : libraries.error ? (
        <ErrorState error={libraries.error} onRetry={() => libraries.refetch()} />
      ) : libraries.data!.length === 0 ? (
        <EmptyState title={t('admin.libraries.noLibrariesYet')}>{t('admin.libraries.emptyHint')}</EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {libraries.data!.map((lib) => (
            <div key={lib.ItemId} className="overflow-hidden rounded-lg bg-base-800/70 ring-1 ring-white/5">
              <div className="flex items-start gap-4 p-4">
                <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded bg-base-750 text-accent">
                  {lib.PrimaryImageItemId ? (
                    <Img
                      src={api.imageUrl(lib.PrimaryImageItemId, 'Primary', { maxWidth: 300 })}
                      className="h-full w-full object-cover"
                      fallback={<LibraryIcon type={lib.CollectionType} size={28} />}
                    />
                  ) : (
                    <LibraryIcon type={lib.CollectionType} size={28} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{lib.Name}</div>
                  <div className="text-sm text-muted">{typeLabel(lib.CollectionType)}</div>
                  {lib.RefreshStatus === 'Active' && (
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-muted">
                        <span>{t('admin.libraries.scanningLabel')}</span>
                        <span className="tabular-nums">{Math.round(lib.RefreshProgress ?? 0)}%</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded bg-white/10">
                        <div className="h-full bg-accent transition-all" style={{ width: `${lib.RefreshProgress ?? 0}%` }} />
                      </div>
                    </div>
                  )}
                </div>
                <Menu
                  items={[
                    {
                      label: t('admin.libraries.scanLibraryFiles'),
                      icon: <RefreshCw size={16} />,
                      onSelect: () => refresh.mutate({ lib, full: false }),
                    },
                    {
                      label: t('admin.libraries.replaceAllMetadata'),
                      icon: <RefreshCw size={16} />,
                      onSelect: () => refresh.mutate({ lib, full: true }),
                    },
                    { label: t('admin.libraries.addFolder'), icon: <FolderPlus size={16} />, onSelect: () => setPickerFor(lib) },
                    { label: t('admin.libraries.rename'), icon: <Pencil size={16} />, onSelect: () => setRenaming(lib) },
                    { divider: true, label: '' },
                    {
                      label: t('admin.libraries.removeLibrary'),
                      icon: <Trash2 size={16} />,
                      danger: true,
                      onSelect: () => setDeleting(lib),
                    },
                  ]}
                  trigger={({ toggle, open }) => (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={toggle}
                      aria-expanded={open}
                      aria-label={t('admin.libraries.libraryActions')}
                    >
                      <MoreHorizontal size={18} />
                    </Button>
                  )}
                />
              </div>
              <div className="border-t border-white/5 px-4 py-3">
                <div className="mb-1.5 text-xs font-semibold tracking-wider text-faint uppercase">{t('admin.libraries.folders')}</div>
                {lib.Locations.length === 0 && <p className="text-sm text-muted">{t('admin.libraries.noFolders')}</p>}
                {lib.Locations.map((loc) => (
                  <div key={loc} className="group flex items-center gap-2 py-1">
                    <span className="min-w-0 flex-1 truncate font-mono text-sm text-fg/85" title={loc}>
                      {loc}
                    </span>
                    <button
                      onClick={() => removePath.mutate({ lib, path: loc })}
                      className="rounded p-1 text-faint opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-danger"
                      aria-label={t('admin.libraries.removeLocation', { loc })}
                      title={t('admin.libraries.removeFolder')}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setPickerFor(lib)}
                  className="mt-1 inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
                >
                  <FolderPlus size={14} /> {t('admin.libraries.addFolder')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddLibraryModal open={adding} onClose={() => setAdding(false)} onCreated={invalidate} />
      <RenameModal library={renaming} onClose={() => setRenaming(null)} onDone={invalidate} />
      <FolderPicker
        open={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        onPick={(path) => {
          // Resolve by id so a rename that just happened can't leave us with a stale name.
          const lib = libraries.data?.find((l) => l.ItemId === pickerFor?.ItemId) ?? pickerFor;
          if (lib) addPath.mutate({ lib, path });
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={t('admin.libraries.removeLibrary')}
        danger
        confirmLabel={t('admin.libraries.removeLabel')}
        loading={remove.isPending}
        message={<>{tRich('admin.libraries.removeConfirm', { name: <strong className="text-fg">{deleting?.Name}</strong> })}</>}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </AdminPage>
  );
}

function AddLibraryModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const api = useApi();
  const toast = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState('movies');
  const [paths, setPaths] = useState<string[]>([]);
  const [picker, setPicker] = useState(false);

  const reset = () => {
    setName('');
    setType('movies');
    setPaths([]);
  };

  const create = useMutation({
    mutationFn: () =>
      api.post(
        '/Library/VirtualFolders',
        { LibraryOptions: { PathInfos: paths.map((p) => ({ Path: p })), EnableRealtimeMonitor: true } },
        { name: name.trim(), collectionType: type === 'mixed' ? undefined : type, refreshLibrary: true },
      ),
    onSuccess: () => {
      toast.success(t('admin.libraries.libraryCreated', { name: name.trim() }));
      reset();
      onClose();
      onCreated();
    },
    onError: (e) => toast.error(e),
  });

  return (
    <>
      <Modal
        open={open && !picker}
        onClose={onClose}
        title={t('admin.libraries.addLibrary')}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={create.isPending}
              disabled={!name.trim() || paths.length === 0}
              onClick={() => create.mutate()}
            >
              {t('admin.libraries.addLibrary')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t('admin.libraries.contentType')}>
            <Select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                if (!name) setName(TYPES.find((option) => option.value === e.target.value)?.label ?? '');
              }}
            >
              {TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.name')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('common.movies')} />
          </Field>
          <div>
            <div className="mb-1.5 text-sm font-medium">{t('admin.libraries.folders')}</div>
            <div className="space-y-1.5">
              {paths.map((p) => (
                <div key={p} className="flex items-center gap-2 rounded-md bg-black/25 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-sm">{p}</span>
                  <button
                    onClick={() => setPaths((ps) => ps.filter((x) => x !== p))}
                    className="text-faint hover:text-danger"
                    aria-label={t('admin.libraries.removeLabel')}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" className="mt-2" icon={<FolderPlus size={14} />} onClick={() => setPicker(true)}>
              {t('admin.libraries.browseForFolder')}
            </Button>
          </div>
        </div>
      </Modal>
      <FolderPicker
        open={open && picker}
        onClose={() => setPicker(false)}
        onPick={(p) => setPaths((ps) => (ps.includes(p) ? ps : [...ps, p]))}
      />
    </>
  );
}

function RenameModal({ library, onClose, onDone }: { library: VirtualFolderInfo | null; onClose: () => void; onDone: () => void }) {
  const api = useApi();
  const toast = useToast();
  const [name, setName] = useState('');
  const [prev, setPrev] = useState<VirtualFolderInfo | null>(null);
  if (library !== prev) {
    setPrev(library);
    setName(library?.Name ?? '');
  }
  const qc = useQueryClient();
  const rename = useMutation({
    mutationFn: () =>
      api.post('/Library/VirtualFolders/Name', undefined, { name: library!.Name, newName: name.trim(), refreshLibrary: true }),
    onSuccess: () => {
      const newName = name.trim();
      qc.setQueryData<VirtualFolderInfo[]>(['admin', 'virtualfolders'], (list) =>
        list?.map((l) => (l.ItemId === library!.ItemId ? { ...l, Name: newName } : l)),
      );
      toast.success(t('admin.libraries.libraryRenamed'));
      onClose();
      onDone();
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Modal
      open={library !== null}
      onClose={onClose}
      title={t('admin.libraries.renameLibrary')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={rename.isPending}
            disabled={!name.trim() || name.trim() === library?.Name}
            onClick={() => rename.mutate()}
          >
            {t('admin.libraries.rename')}
          </Button>
        </>
      }
    >
      <Field label={t('common.name')}>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
    </Modal>
  );
}
