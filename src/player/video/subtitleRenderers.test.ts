import { describe, expect, it } from 'vitest';
import { isFontAttachment, subtitleFormat } from './subtitleRenderers';

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
