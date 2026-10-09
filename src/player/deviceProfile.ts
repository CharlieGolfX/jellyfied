import { isChromium, isSafari } from '@/api/device';

/** Bitrate used for "Auto/Original" quality. */
export const MAX_BITRATE = 120_000_000;

let cached: { profile: Record<string, unknown>; bitrate: number } | null = null;

function probe() {
  const video = document.createElement('video');
  const audio = document.createElement('audio');
  const v = (type: string) => video.canPlayType(type).replace(/no/, '') !== '';
  const a = (type: string) => audio.canPlayType(type).replace(/no/, '') !== '';
  const hdr = typeof window.matchMedia === 'function' && window.matchMedia('(dynamic-range: high)').matches;
  return {
    h264: v('video/mp4; codecs="avc1.640029"') || v('video/mp4; codecs="avc1.42E01E"'),
    hevc: v('video/mp4; codecs="hvc1.1.6.L123.b0"') || v('video/mp4; codecs="hev1.1.6.L123.b0"'),
    av1: v('video/mp4; codecs="av01.0.08M.08"'),
    vp9: v('video/webm; codecs="vp9"') || v('video/mp4; codecs="vp09.00.10.08"'),
    vp8: v('video/webm; codecs="vp8"'),
    webm: v('video/webm'),
    aac: a('audio/mp4; codecs="mp4a.40.2"'),
    mp3: a('audio/mpeg'),
    opus: a('audio/webm; codecs="opus"') || a('audio/ogg; codecs="opus"'),
    opusMp4: v('video/mp4; codecs="opus"'),
    flac: a('audio/flac') || v('video/mp4; codecs="flac"'),
    vorbis: a('audio/ogg; codecs="vorbis"') || a('audio/webm; codecs="vorbis"'),
    ac3: v('video/mp4; codecs="ac-3"') || a('audio/mp4; codecs="ac-3"'),
    eac3: v('video/mp4; codecs="ec-3"') || a('audio/mp4; codecs="ec-3"'),
    wav: a('audio/wav'),
    hdr,
  };
}

function join(list: (string | false | undefined)[]): string {
  return list.filter(Boolean).join(',');
}

/** Builds a Jellyfin DeviceProfile describing what this browser can play natively. */
export function buildDeviceProfile(maxBitrate: number = MAX_BITRATE): Record<string, unknown> {
  if (cached && cached.bitrate === maxBitrate) return cached.profile;
  const c = probe();
  const safari = isSafari();
  const chromium = isChromium();

  const videoCodecs = join([c.h264 && 'h264', c.hevc && 'hevc', c.av1 && 'av1', c.vp9 && 'vp9']);
  const mp4Audio = join([
    c.aac && 'aac',
    c.mp3 && 'mp3',
    c.opusMp4 && 'opus',
    c.flac && 'flac',
    c.ac3 && 'ac3',
    c.eac3 && 'eac3',
    safari && 'alac',
  ]);

  const directPlay: Record<string, unknown>[] = [
    { Container: 'mp4,m4v', Type: 'Video', VideoCodec: videoCodecs, AudioCodec: mp4Audio },
  ];
  if (chromium) {
    // Chromium plays Matroska even though canPlayType() reports otherwise.
    directPlay.push({
      Container: 'mkv',
      Type: 'Video',
      VideoCodec: videoCodecs,
      AudioCodec: join([mp4Audio, c.vorbis && 'vorbis']),
    });
  }
  if (safari) {
    directPlay.push({ Container: 'mov', Type: 'Video', VideoCodec: join([c.h264 && 'h264', c.hevc && 'hevc']), AudioCodec: mp4Audio });
  }
  if (c.webm) {
    directPlay.push({
      Container: 'webm',
      Type: 'Video',
      VideoCodec: join([c.vp8 && 'vp8', c.vp9 && 'vp9', c.av1 && 'av1']),
      AudioCodec: join([c.vorbis && 'vorbis', c.opus && 'opus']),
    });
  }

  // Audio
  if (c.mp3) directPlay.push({ Container: 'mp3', Type: 'Audio' });
  if (c.aac) {
    directPlay.push({ Container: 'aac', Type: 'Audio' });
    directPlay.push({ Container: 'm4a,m4b', AudioCodec: join(['aac', safari && 'alac', c.flac && 'flac']), Type: 'Audio' });
    directPlay.push({ Container: 'mp4', AudioCodec: 'aac', Type: 'Audio' });
  }
  if (c.flac) directPlay.push({ Container: 'flac', Type: 'Audio' });
  if (c.opus) {
    directPlay.push({ Container: 'webm', AudioCodec: 'opus', Type: 'Audio' });
    directPlay.push({ Container: 'ogg', AudioCodec: 'opus', Type: 'Audio' });
    directPlay.push({ Container: 'opus', Type: 'Audio' });
  }
  if (c.vorbis) {
    directPlay.push({ Container: 'ogg', AudioCodec: 'vorbis', Type: 'Audio' });
    directPlay.push({ Container: 'webm', AudioCodec: 'vorbis', Type: 'Audio' });
  }
  if (c.wav) directPlay.push({ Container: 'wav', Type: 'Audio' });

  const sdrOnly = 'SDR';
  const rangeTypes = c.hdr ? 'SDR|HDR10|HDR10Plus|HLG' : sdrOnly;

  const codecProfiles: Record<string, unknown>[] = [
    {
      Type: 'Video',
      Codec: 'h264',
      Conditions: [
        { Condition: 'NotEquals', Property: 'IsAnamorphic', Value: 'true', IsRequired: false },
        { Condition: 'EqualsAny', Property: 'VideoProfile', Value: 'high|main|baseline|constrained baseline', IsRequired: false },
        { Condition: 'EqualsAny', Property: 'VideoRangeType', Value: 'SDR', IsRequired: false },
        { Condition: 'LessThanEqual', Property: 'VideoLevel', Value: '52', IsRequired: false },
        { Condition: 'NotEquals', Property: 'IsInterlaced', Value: 'true', IsRequired: false },
        // Browsers cannot decode 10-bit H.264 (Hi10P).
        { Condition: 'LessThanEqual', Property: 'VideoBitDepth', Value: '8', IsRequired: false },
      ],
    },
    {
      // Browsers can't switch between audio tracks in a file, so a non-default track forces a remux/transcode.
      Type: 'VideoAudio',
      Conditions: [{ Condition: 'Equals', Property: 'IsSecondaryAudio', Value: 'false', IsRequired: false }],
    },
  ];
  if (c.hevc) {
    codecProfiles.push({
      Type: 'Video',
      Codec: 'hevc',
      Conditions: [
        { Condition: 'NotEquals', Property: 'IsAnamorphic', Value: 'true', IsRequired: false },
        { Condition: 'EqualsAny', Property: 'VideoProfile', Value: 'main|main 10', IsRequired: false },
        { Condition: 'EqualsAny', Property: 'VideoRangeType', Value: rangeTypes, IsRequired: false },
        { Condition: 'LessThanEqual', Property: 'VideoLevel', Value: '183', IsRequired: false },
        { Condition: 'NotEquals', Property: 'IsInterlaced', Value: 'true', IsRequired: false },
      ],
    });
  }
  if (c.av1) {
    codecProfiles.push({
      Type: 'Video',
      Codec: 'av1',
      Conditions: [
        { Condition: 'EqualsAny', Property: 'VideoRangeType', Value: rangeTypes, IsRequired: false },
        { Condition: 'LessThanEqual', Property: 'VideoBitDepth', Value: '10', IsRequired: false },
      ],
    });
  }
  if (c.vp9) {
    codecProfiles.push({
      Type: 'Video',
      Codec: 'vp9',
      Conditions: [{ Condition: 'EqualsAny', Property: 'VideoRangeType', Value: rangeTypes, IsRequired: false }],
    });
  }

  const profile = {
    Name: 'Jellyplex Web',
    MaxStreamingBitrate: maxBitrate,
    MaxStaticBitrate: 100_000_000,
    MusicStreamingTranscodingBitrate: 384_000,
    DirectPlayProfiles: directPlay,
    TranscodingProfiles: [
      {
        Container: 'ts',
        Type: 'Video',
        AudioCodec: join(['aac', c.mp3 && 'mp3']),
        VideoCodec: 'h264',
        Context: 'Streaming',
        Protocol: 'hls',
        MaxAudioChannels: '2',
        MinSegments: 1,
        BreakOnNonKeyFrames: true,
      },
      {
        Container: 'mp3',
        Type: 'Audio',
        AudioCodec: 'mp3',
        Context: 'Streaming',
        Protocol: 'http',
        MaxAudioChannels: '2',
      },
    ],
    ContainerProfiles: [],
    CodecProfiles: codecProfiles,
    SubtitleProfiles: [
      { Format: 'vtt', Method: 'External' },
      { Format: 'webvtt', Method: 'External' },
    ],
    ResponseProfiles: [{ Type: 'Video', Container: 'm4v', MimeType: 'video/mp4' }],
  };
  cached = { profile, bitrate: maxBitrate };
  return profile;
}
