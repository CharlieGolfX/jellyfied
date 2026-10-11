import type { CardShape } from '@/api/images';
import type { CollectionType } from '@/api/types';

export type TabId = 'recommended' | 'library' | 'collections' | 'genres' | 'albums' | 'artists' | 'browse';

export interface TabDef {
  id: TabId;
  label: string;
}

export interface SortDef {
  label: string;
  value: string;
  defaultOrder: 'Ascending' | 'Descending';
}

export const SORT_TITLE: SortDef = { label: 'Title', value: 'SortName', defaultOrder: 'Ascending' };
export const SORT_ADDED: SortDef = { label: 'Date Added', value: 'DateCreated,SortName', defaultOrder: 'Descending' };
export const SORT_RELEASE: SortDef = { label: 'Release Date', value: 'PremiereDate,ProductionYear,SortName', defaultOrder: 'Descending' };
export const SORT_YEAR: SortDef = { label: 'Year', value: 'ProductionYear,SortName', defaultOrder: 'Descending' };
export const SORT_RATING: SortDef = { label: 'Audience Rating', value: 'CommunityRating,SortName', defaultOrder: 'Descending' };
export const SORT_CRITIC: SortDef = { label: 'Critic Rating', value: 'CriticRating,SortName', defaultOrder: 'Descending' };
export const SORT_RUNTIME: SortDef = { label: 'Duration', value: 'Runtime,SortName', defaultOrder: 'Ascending' };
export const SORT_PLAYED: SortDef = { label: 'Last Played', value: 'DatePlayed,SortName', defaultOrder: 'Descending' };
export const SORT_PLAYCOUNT: SortDef = { label: 'Plays', value: 'PlayCount,SortName', defaultOrder: 'Descending' };
export const SORT_ARTIST: SortDef = { label: 'Album Artist', value: 'AlbumArtist,SortName', defaultOrder: 'Ascending' };
export const SORT_RANDOM: SortDef = { label: 'Randomly', value: 'Random', defaultOrder: 'Ascending' };

export interface LibraryConfig {
  tabs: TabDef[];
  /** Item types for the main "Library" grid. */
  itemTypes?: string[];
  sorts: SortDef[];
  shape: CardShape;
  watchFilters: boolean;
}

export function configFor(type: CollectionType | null | undefined): LibraryConfig {
  switch (type) {
    case 'movies':
      return {
        tabs: [
          { id: 'recommended', label: 'Recommended' },
          { id: 'library', label: 'Library' },
          { id: 'collections', label: 'Collections' },
          { id: 'genres', label: 'Categories' },
        ],
        itemTypes: ['Movie'],
        sorts: [SORT_TITLE, SORT_ADDED, SORT_RELEASE, SORT_RATING, SORT_CRITIC, SORT_RUNTIME, SORT_PLAYED, SORT_RANDOM],
        shape: 'poster',
        watchFilters: true,
      };
    case 'tvshows':
      return {
        tabs: [
          { id: 'recommended', label: 'Recommended' },
          { id: 'library', label: 'Library' },
          { id: 'genres', label: 'Categories' },
        ],
        itemTypes: ['Series'],
        sorts: [SORT_TITLE, { ...SORT_ADDED, value: 'DateLastContentAdded,SortName' }, SORT_RELEASE, SORT_RATING, SORT_PLAYED, SORT_RANDOM],
        shape: 'poster',
        watchFilters: true,
      };
    case 'music':
      return {
        tabs: [
          { id: 'recommended', label: 'Recommended' },
          { id: 'albums', label: 'Albums' },
          { id: 'artists', label: 'Artists' },
          { id: 'genres', label: 'Genres' },
        ],
        itemTypes: ['MusicAlbum'],
        sorts: [SORT_TITLE, SORT_ARTIST, SORT_YEAR, SORT_ADDED, SORT_PLAYED, SORT_PLAYCOUNT, SORT_RANDOM],
        shape: 'square',
        watchFilters: false,
      };
    case 'musicvideos':
      return {
        tabs: [{ id: 'library', label: 'Library' }],
        itemTypes: ['MusicVideo'],
        sorts: [SORT_TITLE, SORT_ADDED, SORT_YEAR, SORT_RANDOM],
        shape: 'landscape',
        watchFilters: true,
      };
    case 'boxsets':
      return {
        tabs: [{ id: 'library', label: 'Collections' }],
        itemTypes: ['BoxSet'],
        sorts: [SORT_TITLE, SORT_ADDED, SORT_RANDOM],
        shape: 'poster',
        watchFilters: false,
      };
    case 'playlists':
      return {
        tabs: [{ id: 'library', label: 'Playlists' }],
        itemTypes: ['Playlist'],
        sorts: [SORT_TITLE, SORT_ADDED],
        shape: 'square',
        watchFilters: false,
      };
    case 'books':
      return {
        tabs: [
          { id: 'browse', label: 'Folders' },
          { id: 'library', label: 'All Books' },
        ],
        itemTypes: ['Book', 'AudioBook'],
        sorts: [SORT_TITLE, SORT_ADDED, SORT_YEAR],
        shape: 'poster',
        watchFilters: false,
      };
    case 'photos':
      return { tabs: [{ id: 'browse', label: 'Browse' }], sorts: [SORT_TITLE, SORT_ADDED], shape: 'square', watchFilters: false };
    case 'homevideos':
      return {
        tabs: [{ id: 'browse', label: 'Browse' }],
        sorts: [SORT_TITLE, SORT_ADDED, SORT_RELEASE],
        shape: 'landscape',
        watchFilters: true,
      };
    default:
      return {
        tabs: [
          { id: 'browse', label: 'Browse' },
          { id: 'library', label: 'All Videos' },
        ],
        itemTypes: ['Movie', 'Series', 'Video', 'MusicVideo'],
        sorts: [SORT_TITLE, SORT_ADDED, SORT_RELEASE],
        shape: 'poster',
        watchFilters: true,
      };
  }
}
