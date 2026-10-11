import { describe, expect, it } from 'vitest';
import { profileFor, type Capabilities } from './deviceProfile';

const base: Capabilities = {
  h264: true,
  hevc: false,
  av1: false,
  vp9: true,
  vp8: true,
  webm: true,
  aac: true,
  mp3: true,
  opus: true,
  opusMp4: true,
  flac: true,
  vorbis: true,
  ac3: false,
  eac3: false,
  wav: true,
  hdr: false,
  dolbyVision: false,
  hls: { hevc: false, av1: false, ac3: false, eac3: false, opus: false, flac: false },
  audioChannels: 2,
  safari: false,
  chromium: true,
  assSubtitles: true,
  pgsSubtitles: true,
};

interface Profile {
  TranscodingProfiles: { Container: string; Type: string; VideoCodec?: string; AudioCodec: string; MaxAudioChannels: string }[];
  CodecProfiles: { Type: string; Codec?: string; Conditions: { Property: string; Value: string; Condition: string }[] }[];
  SubtitleProfiles: { Format: string; Method: string }[];
}

const build = (caps: Partial<Capabilities>, rich = true) =>
  profileFor({ ...base, ...caps }, 8_000_000, { richSubtitles: rich }) as unknown as Profile;
const videoTranscodes = (p: Profile) => p.TranscodingProfiles.filter((t) => t.Type === 'Video');
const condition = (p: Profile, codec: string, property: string) =>
  p.CodecProfiles.find((c) => c.Codec === codec)?.Conditions.find((c) => c.Property === property)?.Value;

describe('transcoding profiles', () => {
  it('only offers H.264 in MPEG-TS when the browser has neither HEVC nor AV1', () => {
    const video = videoTranscodes(build({}));
    expect(video).toHaveLength(1);
    expect(video[0]).toMatchObject({ Container: 'ts', VideoCodec: 'h264', MaxAudioChannels: '2' });
  });

  it('offers AV1 and HEVC in fMP4 ahead of H.264, and keeps MPEG-TS as the fallback', () => {
    const video = videoTranscodes(build({ hls: { ...base.hls, hevc: true, av1: true } }));
    expect(video.map((t) => t.Container)).toEqual(['mp4', 'ts']);
    expect(video[0].VideoCodec).toBe('av1,hevc,h264');
  });

  it('offers HEVC alone when AV1 is missing, and the other way round', () => {
    expect(videoTranscodes(build({ hls: { ...base.hls, hevc: true } }))[0].VideoCodec).toBe('hevc,h264');
    expect(videoTranscodes(build({ hls: { ...base.hls, av1: true } }))[0].VideoCodec).toBe('av1,h264');
  });

  it('asks for surround sound only when the output has the channels for it', () => {
    const surround = videoTranscodes(build({ audioChannels: 6, hls: { ...base.hls, hevc: true, ac3: true, eac3: true } }));
    expect(surround.every((t) => t.MaxAudioChannels === '6')).toBe(true);
    expect(surround[0].AudioCodec).toBe('aac,ac3,eac3');
    expect(videoTranscodes(build({ audioChannels: 2 })).every((t) => t.MaxAudioChannels === '2')).toBe(true);
  });
});

describe('dynamic range', () => {
  it('plays Dolby Vision with an SDR layer on any screen, and the HDR kinds only on an HDR screen', () => {
    expect(condition(build({ hevc: true }), 'hevc', 'VideoRangeType')).toBe('SDR|DOVIWithSDR');
    expect(condition(build({ hevc: true, hdr: true }), 'hevc', 'VideoRangeType')).toBe(
      'SDR|DOVIWithSDR|HDR10|HDR10Plus|HLG|DOVIWithHDR10|DOVIWithHDR10Plus|DOVIWithHLG',
    );
  });

  it('only takes Dolby Vision without a fallback layer when the browser decodes Dolby Vision', () => {
    expect(condition(build({ hevc: true, hdr: true, dolbyVision: true }), 'hevc', 'VideoRangeType')).toMatch(/\|DOVI$/);
    expect(condition(build({ hevc: true, hdr: true }), 'hevc', 'VideoRangeType')).not.toMatch(/\|DOVI$/);
  });

  it('has files tagged as Dolby Vision re-wrapped unless the browser decodes Dolby Vision', () => {
    const tags = (p: Profile) =>
      p.CodecProfiles.find((c) => c.Codec === 'hevc')!.Conditions.filter((c) => c.Property === 'VideoCodecTag').map((c) => c.Value);
    expect(tags(build({ hevc: true }))).toEqual(['dvh1', 'dvhe', 'dav1', 'dovi']);
    expect(tags(build({ hevc: true, dolbyVision: true }))).toEqual([]);
  });

  it('keeps H.264 to SDR', () => {
    expect(condition(build({ hdr: true }), 'h264', 'VideoRangeType')).toBe('SDR');
  });
});

describe('subtitle profiles', () => {
  const formats = (p: Profile) => p.SubtitleProfiles.map((s) => s.Format);

  it('lists WebVTT first, so plain text subtitles are still converted to it', () => {
    expect(formats(build({}))).toEqual(['vtt', 'webvtt', 'ass', 'ssa', 'pgssub']);
  });

  it('leaves out what the browser cannot draw', () => {
    expect(formats(build({ assSubtitles: false }))).toEqual(['vtt', 'webvtt', 'pgssub']);
    expect(formats(build({ pgsSubtitles: false }))).toEqual(['vtt', 'webvtt', 'ass', 'ssa']);
  });

  it('falls back to server-side conversion when asked to', () => {
    expect(formats(build({}, false))).toEqual(['vtt', 'webvtt']);
  });
});
