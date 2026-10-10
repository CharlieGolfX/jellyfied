import type { BaseItemDto } from '@/api/types';

/** Item types whose metadata can be edited (server folders and views are managed in the dashboard). */
export function supportsMetadataEditing(item: BaseItemDto): boolean {
  return !['UserView', 'CollectionFolder', 'Program', 'TvChannel', 'Channel'].includes(item.Type);
}
