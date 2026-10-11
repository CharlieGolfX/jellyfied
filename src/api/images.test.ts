import { describe, expect, it } from 'vitest';
import { JellyfinApi } from './client';
import { blurHashOf, cardImage, cardSrcSet } from './images';
import type { BaseItemDto } from './types';

const api = new JellyfinApi('http://jellyfin.test');
const item = {
  Id: 'movie-1',
  Type: 'Movie',
  ImageTags: { Primary: 'tag-1' },
  ImageBlurHashes: { Primary: { 'tag-1': 'L00000fQfQfQfQfQfQfQfQfQfQfQ' } },
} as unknown as BaseItemDto;

describe('cardSrcSet', () => {
  it('offers the image in several widths and says how wide the card is', () => {
    const { srcSet, sizes } = cardSrcSet(api, cardImage(item, 'poster'), 'poster', 1);
    const candidates = srcSet!.split(', ');
    expect(candidates.map((c) => c.split(' ')[1])).toEqual(['240w', '360w', '540w', '720w']);
    expect(candidates[0]).toContain('/Items/movie-1/Images/Primary?tag=tag-1&maxWidth=240');
    expect(sizes).toBe('170px');
  });

  it('follows the poster size setting', () => {
    expect(cardSrcSet(api, cardImage(item, 'poster'), 'poster', 1.5).sizes).toBe('255px');
  });

  it('is empty without an image', () => {
    expect(cardSrcSet(api, null, 'poster')).toEqual({});
  });
});

describe('blurHashOf', () => {
  it('finds the hash that belongs to the image', () => {
    expect(blurHashOf(item, cardImage(item, 'poster'))).toBe('L00000fQfQfQfQfQfQfQfQfQfQfQ');
    expect(blurHashOf(item, null)).toBeUndefined();
    expect(blurHashOf({ ...item, ImageBlurHashes: undefined }, cardImage(item, 'poster'))).toBeUndefined();
  });
});
