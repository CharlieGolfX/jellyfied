import type { JellyfinApi } from './client';
import type { BaseItemDto, ImageType } from './types';

export type CardShape = 'poster' | 'landscape' | 'square';

interface ImageRef {
  itemId: string;
  type: ImageType;
  tag?: string | null;
}

function primary(item: BaseItemDto): ImageRef | null {
  const tag = item.ImageTags?.Primary;
  return tag ? { itemId: item.Id, type: 'Primary', tag } : null;
}

function backdrop(item: BaseItemDto): ImageRef | null {
  if (item.BackdropImageTags?.length) {
    return { itemId: item.Id, type: 'Backdrop', tag: item.BackdropImageTags[0] };
  }
  if (item.ParentBackdropItemId && item.ParentBackdropImageTags?.length) {
    return { itemId: item.ParentBackdropItemId, type: 'Backdrop', tag: item.ParentBackdropImageTags[0] };
  }
  return null;
}

function thumb(item: BaseItemDto): ImageRef | null {
  if (item.ImageTags?.Thumb) return { itemId: item.Id, type: 'Thumb', tag: item.ImageTags.Thumb };
  if (item.ParentThumbItemId && item.ParentThumbImageTag) {
    return { itemId: item.ParentThumbItemId, type: 'Thumb', tag: item.ParentThumbImageTag };
  }
  return null;
}

function seriesPoster(item: BaseItemDto): ImageRef | null {
  if (item.SeriesId && item.SeriesPrimaryImageTag) {
    return { itemId: item.SeriesId, type: 'Primary', tag: item.SeriesPrimaryImageTag };
  }
  return null;
}

function parentPoster(item: BaseItemDto): ImageRef | null {
  if (item.ParentPrimaryImageItemId && item.ParentPrimaryImageTag) {
    return { itemId: item.ParentPrimaryImageItemId, type: 'Primary', tag: item.ParentPrimaryImageTag };
  }
  if (item.AlbumId && item.AlbumPrimaryImageTag) {
    return { itemId: item.AlbumId, type: 'Primary', tag: item.AlbumPrimaryImageTag };
  }
  return null;
}

/** Picks the best image for a card of the given shape. */
export function cardImage(item: BaseItemDto, shape: CardShape): ImageRef | null {
  if (shape === 'landscape') {
    if (item.Type === 'Episode' || item.Type === 'Video' || item.Type === 'Photo' || item.Type === 'MusicVideo') {
      return primary(item) ?? thumb(item) ?? backdrop(item);
    }
    return thumb(item) ?? backdrop(item) ?? primary(item);
  }
  if (item.Type === 'Episode' && shape === 'poster') {
    return seriesPoster(item) ?? parentPoster(item) ?? primary(item);
  }
  if (item.Type === 'Season') {
    return primary(item) ?? seriesPoster(item) ?? parentPoster(item);
  }
  return primary(item) ?? parentPoster(item) ?? (shape === 'square' ? null : thumb(item));
}

export function imageSrc(api: JellyfinApi, ref: ImageRef | null, width: number): string | undefined {
  if (!ref) return undefined;
  return api.imageUrl(ref.itemId, ref.type, { tag: ref.tag, maxWidth: width });
}

export function backdropSrc(api: JellyfinApi, item: BaseItemDto | undefined, width = 1920): string | undefined {
  if (!item) return undefined;
  return imageSrc(api, backdrop(item) ?? thumb(item), width);
}

export function logoSrc(api: JellyfinApi, item: BaseItemDto, width = 600): string | undefined {
  if (item.ImageTags?.Logo) return api.imageUrl(item.Id, 'Logo', { tag: item.ImageTags.Logo, maxWidth: width });
  if (item.ParentLogoItemId && item.ParentLogoImageTag) {
    return api.imageUrl(item.ParentLogoItemId, 'Logo', { tag: item.ParentLogoImageTag, maxWidth: width });
  }
  return undefined;
}

/** Shape a card should use by default for an item type. */
export function defaultShape(item: BaseItemDto): CardShape {
  switch (item.Type) {
    case 'Episode':
    case 'Video':
    case 'MusicVideo':
    case 'Photo':
    case 'TvChannel':
    case 'LiveTvChannel':
      return 'landscape';
    case 'MusicAlbum':
    case 'MusicArtist':
    case 'Audio':
    case 'Playlist':
    case 'PhotoAlbum':
      return 'square';
    case 'Folder':
    case 'CollectionFolder':
    case 'UserView':
      return item.PrimaryImageAspectRatio && item.PrimaryImageAspectRatio > 1.2 ? 'landscape' : 'poster';
    default:
      return 'poster';
  }
}

/** The widths a card's image is offered in, so the browser can take the one that fits. */
const CARD_WIDTHS: Record<CardShape, number[]> = {
  poster: [240, 360, 540, 720],
  landscape: [400, 560, 840, 1120],
  square: [240, 400, 600, 800],
};
/** Roughly how wide a card of each shape is on screen at the normal size, in CSS pixels. */
const CARD_BASE: Record<CardShape, number> = { poster: 170, landscape: 290, square: 180 };

/**
 * `srcSet` and `sizes` for a card's image. The browser multiplies the size by the screen's pixel
 * density and picks the smallest candidate that is large enough: phones stop downloading desktop
 * posters, and dense screens get sharper ones.
 */
export function cardSrcSet(api: JellyfinApi, ref: ImageRef | null, shape: CardShape, scale = 1): { srcSet?: string; sizes?: string } {
  if (!ref) return {};
  return {
    srcSet: CARD_WIDTHS[shape].map((w) => `${imageSrc(api, ref, w)} ${w}w`).join(', '),
    sizes: `${Math.round(CARD_BASE[shape] * scale)}px`,
  };
}

/** The blurred stand-in Jellyfin sent for an image, if it sent one. */
export function blurHashOf(item: BaseItemDto, ref: ImageRef | null): string | undefined {
  return ref?.tag ? item.ImageBlurHashes?.[ref.type]?.[ref.tag] : undefined;
}
