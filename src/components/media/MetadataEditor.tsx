import clsx from 'clsx';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BaseItemDto } from '@/api/types';
import { useApi, useSession } from '@/auth/AuthProvider';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { DetailsTab } from './MetadataDetailsTab';
import { IDENTIFY_TYPES, type Tab } from './metadataEditorTypes';
import { IdentifyTab } from './MetadataIdentifyTab';
import { ImagesTab } from './MetadataImagesTab';
import { t } from '@/i18n';

/** Item types the server can look up with its metadata providers ("Identify"). */

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
    { id: 'details', label: t('media.metadataEditor.details') },
    { id: 'images', label: t('media.metadataEditor.images') },
  ];
  if (item.data && IDENTIFY_TYPES.has(item.data.Type)) tabs.push({ id: 'identify', label: t('media.metadataEditor.identify') });

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={item.data ? t('media.metadataEditor.editMetadata', { name: item.data.Name ?? '' }) : t('common.editMetadata')}
    >
      {item.isLoading ? (
        <div className="flex justify-center py-16 text-accent">
          <Spinner size={32} />
        </div>
      ) : item.error || !item.data ? (
        <ErrorState error={item.error} onRetry={() => item.refetch()} />
      ) : (
        <>
          <div className="mb-5 flex gap-1 border-b border-white/10" role="tablist">
            {tabs.map((entry) => (
              <button
                key={entry.id}
                role="tab"
                aria-selected={tab === entry.id}
                onClick={() => setTab(entry.id)}
                className={clsx(
                  '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                  tab === entry.id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg',
                )}
              >
                {entry.label}
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
