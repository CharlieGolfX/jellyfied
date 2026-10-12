import { describe, expect, it } from 'vitest';
import {
  isFontAttachment,
  isVobSub,
  plainTextUrl,
  sameDelivery,
  subtitleContent,
  subtitleFormat,
  subtitleModeFor,
} from './subtitleRenderers';

describe('subtitleFormat', () => {
  it('reads the format from the address the server delivers the track at', () => {
    expect(subtitleFormat('/Videos/a/b/Subtitles/3/0/Stream.vtt?api_key=x')).toBe('vtt');
    expect(subtitleFormat('/Videos/a/b/Subtitles/3/0/Stream.ass?api_key=x')).toBe('ass');
    expect(subtitleFormat('/Videos/a/b/Subtitles/3/0/Stream.ssa')).toBe('ass');
    expect(subtitleFormat('/Videos/a/b/Subtitles/4/0/Stream.pgssub?api_key=x')).toBe('pgs');
    expect(subtitleFormat('https://host/jellyfin/Videos/a/b/Subtitles/4/0/Stream.sup')).toBe('pgs');
  });

  it('treats anything else as WebVTT', () => {
    expect(subtitleFormat('/Videos/a/b/Subtitles/3/0/Stream.srt')).toBe('vtt');
    expect(subtitleFormat(null)).toBe('vtt');
  });
});

describe('isFontAttachment', () => {
  it('recognises fonts by type or by file name', () => {
    expect(isFontAttachment({ MimeType: 'font/ttf' })).toBe(true);
    expect(isFontAttachment({ MimeType: 'application/x-truetype-font' })).toBe(true);
    expect(isFontAttachment({ MimeType: 'application/vnd.ms-opentype' })).toBe(true);
    expect(isFontAttachment({ MimeType: 'application/octet-stream', FileName: 'Gandhi Sans.OTF' })).toBe(true);
    expect(isFontAttachment({ Codec: 'ttf' })).toBe(true);
  });

  it('leaves other attachments alone', () => {
    expect(isFontAttachment({ MimeType: 'image/jpeg', FileName: 'cover.jpg' })).toBe(false);
    expect(isFontAttachment({})).toBe(false);
  });
});

describe('subtitleContent', () => {
  it('tells plain text, styled text and pictures apart by codec, as the server spells them', () => {
    expect(subtitleContent('subrip')).toBe('text');
    expect(subtitleContent('mov_text')).toBe('text');
    expect(subtitleContent(null)).toBe('text');
    expect(subtitleContent('ass')).toBe('styled');
    expect(subtitleContent('SSA')).toBe('styled');
    expect(subtitleContent('PGSSUB')).toBe('image');
    expect(subtitleContent('DVDSUB')).toBe('image');
    expect(subtitleContent('dvbsub')).toBe('image');
  });

  it('recognises DVD subtitles', () => {
    expect(isVobSub('DVDSUB')).toBe(true);
    expect(isVobSub('dvd_subtitle')).toBe(true);
    expect(isVobSub('pgssub')).toBe(false);
    expect(isVobSub(undefined)).toBe(false);
  });
});

describe('subtitleModeFor', () => {
  const here = { airPlay: false, pip: false, pipDrawsText: true };

  it('draws everything in the browser while the picture is in the page', () => {
    expect(subtitleModeFor(here, 'text')).toBe('canvas');
    expect(subtitleModeFor(here, 'styled')).toBe('canvas');
    expect(subtitleModeFor(here, 'image')).toBe('canvas');
    expect(subtitleModeFor(here, undefined)).toBe('canvas');
  });

  it('has every subtitle burned in for AirPlay, which only carries the picture', () => {
    for (const track of ['text', 'styled', 'image', undefined] as const) {
      expect(subtitleModeFor({ ...here, airPlay: true }, track)).toBe('burn');
    }
  });

  it('turns styled subtitles into text for a picture-in-picture window that draws text, and burns pictures in', () => {
    const pip = { ...here, pip: true };
    expect(subtitleModeFor(pip, 'styled')).toBe('text');
    expect(subtitleModeFor(pip, 'image')).toBe('burn');
  });

  it('burns styled subtitles in too where the picture-in-picture window draws no text', () => {
    expect(subtitleModeFor({ ...here, pip: true, pipDrawsText: false }, 'styled')).toBe('burn');
  });

  it('leaves plain text subtitles and no subtitles alone in picture-in-picture', () => {
    expect(subtitleModeFor({ ...here, pip: true, pipDrawsText: false }, 'text')).toBe('canvas');
    expect(subtitleModeFor({ ...here, pip: true }, undefined)).toBe('canvas');
  });
});

describe('plainTextUrl', () => {
  it('points a styled track at its WebVTT version', () => {
    expect(plainTextUrl('/Videos/a/b/Subtitles/3/0/Stream.ass?ApiKey=x')).toBe('/Videos/a/b/Subtitles/3/0/Stream.vtt?ApiKey=x');
    expect(plainTextUrl('https://host/Videos/a/b/Subtitles/3/0/Stream.ssa')).toBe('https://host/Videos/a/b/Subtitles/3/0/Stream.vtt');
    expect(subtitleFormat(plainTextUrl('/Videos/a/b/Subtitles/3/0/Stream.ass'))).toBe('vtt');
  });

  it('leaves other addresses as they are', () => {
    expect(plainTextUrl('/Videos/a/b/Subtitles/4/0/Stream.pgssub?ApiKey=x')).toBe('/Videos/a/b/Subtitles/4/0/Stream.pgssub?ApiKey=x');
  });
});

describe('sameDelivery', () => {
  it('needs no new stream for text when only the way it is drawn changes', () => {
    expect(sameDelivery('canvas', 'text', 'styled')).toBe(true);
    expect(sameDelivery('text', 'canvas', 'text')).toBe(true);
    expect(sameDelivery('burn', 'burn', 'image')).toBe(true);
  });

  it('needs one when subtitles start or stop being burned in', () => {
    expect(sameDelivery('canvas', 'burn', 'styled')).toBe(false);
    expect(sameDelivery('burn', 'canvas', 'text')).toBe(false);
    expect(sameDelivery('canvas', 'text', 'image')).toBe(false);
  });
});
