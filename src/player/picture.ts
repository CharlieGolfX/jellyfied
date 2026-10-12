import type { CSSProperties } from 'react';
import { t } from '@/i18n';

/** How the picture is scaled to the player. */
export type PictureFit = 'fit' | 'fill' | 'stretch';
export type PictureAspect = 'auto' | '16:9' | '4:3' | '21:9' | '2.39:1';

export const PICTURE_FITS: { value: PictureFit; label: string; title: string }[] = [
  { value: 'fit', label: t('player.picture.fit'), title: t('player.picture.showTheWholePicture') },
  { value: 'fill', label: t('player.picture.fill'), title: t('player.picture.fillTheScreenAndCrop') },
  { value: 'stretch', label: t('player.picture.stretch'), title: t('player.picture.stretchHint') },
];

export const PICTURE_ASPECTS: { value: PictureAspect; label: string; ratio?: number }[] = [
  { value: 'auto', label: t('player.picture.original') },
  { value: '16:9', label: '16:9', ratio: 16 / 9 },
  { value: '4:3', label: '4:3', ratio: 4 / 3 },
  { value: '21:9', label: '21:9', ratio: 21 / 9 },
  { value: '2.39:1', label: '2.39:1', ratio: 2.39 },
];

export const MAX_PICTURE_ZOOM = 2;

const FIT_KEY = 'jellyplex.pictureFit';

export function readPictureFit(): PictureFit {
  try {
    const v = localStorage.getItem(FIT_KEY);
    return PICTURE_FITS.some((f) => f.value === v) ? (v as PictureFit) : 'fit';
  } catch {
    return 'fit';
  }
}

export function storePictureFit(fit: PictureFit) {
  try {
    localStorage.setItem(FIT_KEY, fit);
  } catch {
    /* ignore */
  }
}

/**
 * Position and size of the video element inside the player, or undefined for the normal
 * "whole picture, original shape" case, which plain CSS handles.
 */
export function pictureStyle(opts: {
  fit: PictureFit;
  aspect: PictureAspect;
  zoom: number;
  /** Player size in px. */
  box: { width: number; height: number };
  /** Size of the video itself in px (0 while unknown). */
  video: { width: number; height: number };
}): CSSProperties | undefined {
  const { fit, aspect, zoom, box, video } = opts;
  if (fit === 'fit' && aspect === 'auto' && zoom === 1) return undefined;
  if (!box.width || !box.height) return undefined;
  const original = video.width && video.height ? video.width / video.height : 16 / 9;
  const ratio = fit === 'stretch' ? box.width / box.height : (PICTURE_ASPECTS.find((a) => a.value === aspect)?.ratio ?? original);
  const fitted = fit === 'fill' ? Math.max(box.width, box.height * ratio) : Math.min(box.width, box.height * ratio);
  const width = fitted * zoom;
  const height = (fitted / ratio) * zoom;
  return {
    width,
    height,
    left: (box.width - width) / 2,
    top: (box.height - height) / 2,
    // The element has exactly the wanted shape, so the picture is stretched onto all of it.
    objectFit: 'fill',
  };
}
