import type { ImageType } from '@/api/types';

export const IDENTIFY_TYPES = new Set([
  'Movie',
  'Series',
  'BoxSet',
  'MusicAlbum',
  'MusicArtist',
  'MusicVideo',
  'Person',
  'Book',
  'Trailer',
]);

export interface EditorInfo {
  ParentalRatingOptions?: { Name?: string | null }[];
  ExternalIdInfos?: { Name: string; Key: string; Type?: string | null }[];
}

export interface ImageInfo {
  ImageType: ImageType;
  ImageIndex?: number | null;
  ImageTag?: string | null;
  Width?: number | null;
  Height?: number | null;
}

export interface RemoteImage {
  ProviderName?: string | null;
  Url: string;
  ThumbnailUrl?: string | null;
  Width?: number | null;
  Height?: number | null;
  Language?: string | null;
  CommunityRating?: number | null;
}

export interface RemoteSearchResult {
  Name?: string | null;
  ProductionYear?: number | null;
  ImageUrl?: string | null;
  SearchProviderName?: string | null;
  Overview?: string | null;
  ProviderIds?: Record<string, string>;
}

export type Tab = 'details' | 'images' | 'identify';
