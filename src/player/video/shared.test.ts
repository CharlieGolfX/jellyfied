import { describe, expect, it } from 'vitest';
import type { BaseItemDto, TrickplayInfo } from '@/api/types';
import { clampStep, formatAudioDelay, formatSubtitleDelay, pickTrickplay, streamName } from './shared';

describe('clampStep', () => {
  it('keeps a value within its limits', () => {
    expect(clampStep(5, 0, 3)).toBe(3);
    expect(clampStep(-1, 0, 3)).toBe(0);
  });

  it('rounds away the noise of repeated small steps', () => {
    let value = 0;
    for (let i = 0; i < 3; i++) value = clampStep(value + 0.1, -60, 60);
    expect(value).toBe(0.3);
  });
});

describe('delay labels', () => {
  it('shows the sign of a subtitle delay', () => {
    expect(formatSubtitleDelay(0)).toBe('0.0 s');
    expect(formatSubtitleDelay(1.5)).toBe('+1.5 s');
    expect(formatSubtitleDelay(-0.3)).toBe('-0.3 s');
  });

  it('shows an audio delay in milliseconds', () => {
    expect(formatAudioDelay(0)).toBe('0 ms');
    expect(formatAudioDelay(0.025)).toBe('+25 ms');
  });
});

describe('streamName', () => {
  it('uses the server’s title, then language and codec, then the track number', () => {
    expect(streamName({ Type: 'Audio', Index: 1, DisplayTitle: 'English - AAC - Stereo' })).toBe('English - AAC - Stereo');
    expect(streamName({ Type: 'Audio', Index: 1, Language: 'eng', Codec: 'aac' })).toBe('eng AAC');
    expect(streamName({ Type: 'Subtitle', Index: 7 })).toBe('Track 7');
  });
});

describe('pickTrickplay', () => {
  const info = (Width: number): TrickplayInfo => ({ Width, Height: Width / 2, TileWidth: 10, TileHeight: 10, ThumbnailCount: 100, Interval: 10_000 });
  const item = { Trickplay: { 'AB12-cd34': { '160': info(160), '300': info(300), '640': info(640) } } } as unknown as BaseItemDto;

  it('picks the size closest to the preview, whatever way the source id is written', () => {
    expect(pickTrickplay(item, 'ab12cd34')?.Width).toBe(300);
  });

  it('has nothing for another source or an item without thumbnails', () => {
    expect(pickTrickplay(item, 'ffff')).toBeNull();
    expect(pickTrickplay({} as BaseItemDto, 'ab12cd34')).toBeNull();
    expect(pickTrickplay(item, undefined)).toBeNull();
  });
});
