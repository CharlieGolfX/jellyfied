import type { CardShape } from '@/api/images';
import type { CollectionType } from '@/api/types';
import { t } from '@/i18n';

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

export const SORT_TITLE: SortDef = { label: t('common.title'), value: 'SortName', defaultOrder: 'Ascending' };
export const SORT_ADDED: SortDef = { label: t('library.config.dateAdded'), value: 'DateCreated,SortName', defaultOrder: 'Descending' };
export const SORT_RELEASE: SortDef = {
  label: t('library.config.releaseDate'),
  value: 'PremiereDate,ProductionYear,SortName',
  defaultOrder: 'Descending',
};
export const SORT_YEAR: SortDef = { label: t('common.year'), value: 'ProductionYear,SortName', defaultOrder: 'Descending' };
export const SORT_RATING: SortDef = {
  label: t('library.config.audienceRating'),
  value: 'CommunityRating,SortName',
  defaultOrder: 'Descending',
};
export const SORT_CRITIC: SortDef = { label: t('library.config.criticRating'), value: 'CriticRating,SortName', defaultOrder: 'Descending' };
export const SORT_RUNTIME: SortDef = { label: t('library.config.duration'), value: 'Runtime,SortName', defaultOrder: 'Ascending' };
export const SORT_PLAYED: SortDef = { label: t('library.config.lastPlayed'), value: 'DatePlayed,SortName', defaultOrder: 'Descending' };
export const SORT_PLAYCOUNT: SortDef = { label: t('library.config.plays'), value: 'PlayCount,SortName', defaultOrder: 'Descending' };
export const SORT_ARTIST: SortDef = { label: t('library.config.albumArtist'), value: 'AlbumArtist,SortName', defaultOrder: 'Ascending' };
export const SORT_RANDOM: SortDef = { label: t('library.config.randomly'), value: 'Random', defaultOrder: 'Ascending' };

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
          { id: 'recommended', label: t('library.config.recommended') },
          { id: 'library', label: t('library.config.library') },
          { id: 'collections', label: t('common.collections') },
          { id: 'genres', label: t('library.config.categories') },
        ],
        itemTypes: ['Movie'],
        sorts: [SORT_TITLE, SORT_ADDED, SORT_RELEASE, SORT_RATING, SORT_CRITIC, SORT_RUNTIME, SORT_PLAYED, SORT_RANDOM],
        shape: 'poster',
        watchFilters: true,
      };
    case 'tvshows':
      return {
        tabs: [
          { id: 'recommended', label: t('library.config.recommended') },
          { id: 'library', label: t('library.config.library') },
          { id: 'genres', label: t('library.config.categories') },
        ],
        itemTypes: ['Series'],
        sorts: [SORT_TITLE, { ...SORT_ADDED, value: 'DateLastContentAdded,SortName' }, SORT_RELEASE, SORT_RATING, SORT_PLAYED, SORT_RANDOM],
        shape: 'poster',
        watchFilters: true,
      };
    case 'music':
      return {
        tabs: [
          { id: 'recommended', label: t('library.config.recommended') },
          { id: 'albums', label: t('common.albums') },
          { id: 'artists', label: t('common.artists') },
          { id: 'genres', label: t('library.config.genres') },
        ],
        itemTypes: ['MusicAlbum'],
        sorts: [SORT_TITLE, SORT_ARTIST, SORT_YEAR, SORT_ADDED, SORT_PLAYED, SORT_PLAYCOUNT, SORT_RANDOM],
        shape: 'square',
        watchFilters: false,
      };
    case 'musicvideos':
      return {
        tabs: [{ id: 'library', label: t('library.config.library') }],
        itemTypes: ['MusicVideo'],
        sorts: [SORT_TITLE, SORT_ADDED, SORT_YEAR, SORT_RANDOM],
        shape: 'landscape',
        watchFilters: true,
      };
    case 'boxsets':
      return {
        tabs: [{ id: 'library', label: t('common.collections') }],
        itemTypes: ['BoxSet'],
        sorts: [SORT_TITLE, SORT_ADDED, SORT_RANDOM],
        shape: 'poster',
        watchFilters: false,
      };
    case 'playlists':
      return {
        tabs: [{ id: 'library', label: t('common.playlists') }],
        itemTypes: ['Playlist'],
        sorts: [SORT_TITLE, SORT_ADDED],
        shape: 'square',
        watchFilters: false,
      };
    case 'books':
      return {
        tabs: [
          { id: 'browse', label: t('library.config.folders') },
          { id: 'library', label: t('library.config.allBooks') },
        ],
        itemTypes: ['Book', 'AudioBook'],
        sorts: [SORT_TITLE, SORT_ADDED, SORT_YEAR],
        shape: 'poster',
        watchFilters: false,
      };
    case 'photos':
      return {
        tabs: [{ id: 'browse', label: t('library.config.browse') }],
        sorts: [SORT_TITLE, SORT_ADDED],
        shape: 'square',
        watchFilters: false,
      };
    case 'homevideos':
      return {
        tabs: [{ id: 'browse', label: t('library.config.browse') }],
        sorts: [SORT_TITLE, SORT_ADDED, SORT_RELEASE],
        shape: 'landscape',
        watchFilters: true,
      };
    default:
      return {
        tabs: [
          { id: 'browse', label: t('library.config.browse') },
          { id: 'library', label: t('library.config.allVideos') },
        ],
        itemTypes: ['Movie', 'Series', 'Video', 'MusicVideo'],
        sorts: [SORT_TITLE, SORT_ADDED, SORT_RELEASE],
        shape: 'poster',
        watchFilters: true,
      };
  }
}
