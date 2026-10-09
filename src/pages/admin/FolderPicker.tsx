import { ArrowUp, Folder, HardDrive } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FileSystemEntryInfo } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { errorMessage } from '@/components/ui/Toast';

/** Browses the server's filesystem to pick a media folder. */
export function FolderPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (path: string) => void;
}) {
  const api = useApi();
  const [path, setPath] = useState('');
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (open) {
      setPath('');
      setTyped('');
    }
  }, [open]);

  const listing = useQuery({
    queryKey: ['admin', 'fs', path],
    queryFn: () =>
      path
        ? api.get<FileSystemEntryInfo[]>('/Environment/DirectoryContents', {
            path,
            includeDirectories: true,
            includeFiles: false,
          })
        : api.get<FileSystemEntryInfo[]>('/Environment/Drives'),
    enabled: open,
  });

  const goUp = async () => {
    if (!path) return;
    try {
      const parent = await api.get<string | null>('/Environment/ParentPath', { path });
      setPath(typeof parent === 'string' ? parent : '');
      setTyped(typeof parent === 'string' ? parent : '');
    } catch {
      setPath('');
      setTyped('');
    }
  };

  const enter = (p: string) => {
    setPath(p);
    setTyped(p);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Select folder"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!typed.trim()}
            onClick={() => {
              onPick(typed.trim());
              onClose();
            }}
          >
            Select
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.trim()) setPath(typed.trim());
          }}
        >
          <Button size="icon" variant="secondary" onClick={goUp} disabled={!path} aria-label="Parent folder" className="rounded-md">
            <ArrowUp size={16} />
          </Button>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="/media/movies" className="font-mono" />
        </form>
        <p className="text-xs text-faint">
          Paths are on the Jellyfin server (inside its container, if it runs in Docker).
        </p>
        <div className="h-72 overflow-y-auto rounded-md bg-black/25 p-1 ring-1 ring-white/5">
          {listing.isLoading ? (
            <div className="flex h-full items-center justify-center text-accent">
              <Spinner />
            </div>
          ) : listing.error ? (
            <p className="p-3 text-sm text-danger">{errorMessage(listing.error)}</p>
          ) : listing.data?.length === 0 ? (
            <p className="p-3 text-sm text-muted">No subfolders.</p>
          ) : (
            listing.data?.map((entry) => (
              <button
                key={entry.Path}
                onClick={() => enter(entry.Path)}
                className="flex w-full items-center gap-2.5 rounded px-3 py-2 text-left text-sm hover:bg-white/10"
              >
                {path ? <Folder size={16} className="shrink-0 text-accent" /> : <HardDrive size={16} className="shrink-0 text-accent" />}
                <span className="truncate">{entry.Name || entry.Path}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
