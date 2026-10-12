import { isChromium, isSafari } from '@/api/device';

/** Bitrate used for "Auto/Original" quality. */
export const MAX_BITRATE = 120_000_000;

/** What this browser can decode and draw, as far as the device profile needs to know. */
export interface Capabilities {
  h264: boolean;
  hevc: boolean;
  av1: boolean;
  vp9: boolean;
  vp8: boolean;
  webm: boolean;
  aac: boolean;
  mp3: boolean;
  opus: boolean;
  opusMp4: boolean;
  flac: boolean;
  vorbis: boolean;
  ac3: boolean;
  eac3: boolean;
  wav: boolean;
  /** The screen shows high dynamic range. */
  hdr: boolean;
  /** Decodes Dolby Vision itself, so files without an HDR10/HLG/SDR fallback layer also play. */
  dolbyVision: boolean;
  /** Codecs that play in an HLS stream with fMP4 segments, which is what a transcode arrives as. */
  hls: { hevc: boolean; av1: boolean; ac3: boolean; eac3: boolean; opus: boolean; flac: boolean };
  /** Channels of the sound output: 2 for stereo, 6 for 5.1. */
  audioChannels: number;
  safari: boolean;
  chromium: boolean;
  /** Image (PGS) subtitles can be drawn here. */
  pgsSubtitles: boolean;
}

/**
 * How subtitles are asked for. 'canvas': styled and image subtitles come as they are and are drawn
 * in the browser. 'text': text subtitles come as text (styled ones are shown as plain text) and the
 * server burns image subtitles into the picture. 'burn': the server burns every subtitle in.
 */
export type SubtitleMode = 'canvas' | 'text' | 'burn';

export interface ProfileOptions {
  subtitles?: SubtitleMode;
  /** In 'canvas' mode: take PGS subtitles as pictures (on unless switched off). */
  images?: boolean;
  /**
   * In 'canvas' mode: leave VobSub subtitles in the file, to be read out of it by the player.
   * Only possible for some files, so it is off unless asked for.
   */
  vobSub?: boolean;
}

/** Channels of the sound output, so surround sound is only asked for when it can be heard. */
function outputChannels(): number {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return 2;
    const ctx = new Ctx();
    const count = ctx.destination.maxChannelCount;
    void ctx.close().catch(() => {});
    return count >= 6 ? 6 : 2;
  } catch {
    return 2;
  }
}

/** Styled subtitles are drawn by libass in a worker, onto a canvas handed over to that worker. */
export function canRenderAss(): boolean {
  return (
    typeof WebAssembly === 'object' &&
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'transferControlToOffscreen' in HTMLCanvasElement.prototype &&
    typeof HTMLVideoElement !== 'undefined' &&
    'requestVideoFrameCallback' in HTMLVideoElement.prototype
  );
}

function probe(): Capabilities {
  const video = document.createElement('video');
  const audio = document.createElement('audio');
  const v = (type: string) => video.canPlayType(type).replace(/no/, '') !== '';
  const a = (type: string) => audio.canPlayType(type).replace(/no/, '') !== '';
  // Transcodes are played through Media Source Extensions where the browser has them (hls.js), and
  // by the browser's own HLS player where it doesn't (iPhone).
  const w = window as unknown as { ManagedMediaSource?: typeof MediaSource; MediaSource?: typeof MediaSource };
  const mse = w.MediaSource ?? w.ManagedMediaSource;
  const hls = (type: string) => (mse && typeof mse.isTypeSupported === 'function' ? mse.isTypeSupported(type) : v(type));
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
    dolbyVision: v('video/mp4; codecs="dvh1.05.06"') || v('video/mp4; codecs="dvhe.05.06"'),
    hls: {
      hevc: hls('video/mp4; codecs="hvc1.1.6.L123.b0"'),
      av1: hls('video/mp4; codecs="av01.0.08M.08"'),
      ac3: hls('audio/mp4; codecs="ac-3"'),
      eac3: hls('audio/mp4; codecs="ec-3"'),
      opus: hls('audio/mp4; codecs="opus"'),
      flac: hls('audio/mp4; codecs="flac"'),
    },
    audioChannels: outputChannels(),
    safari: isSafari(),
    chromium: isChromium(),
    pgsSubtitles: typeof Worker !== 'undefined',
  };
}

function join(list: (string | false | undefined)[]): string {
  return list.filter(Boolean).join(',');
}

/**
 * Dynamic ranges a codec may be played in without the server tone-mapping it. Dolby Vision files
 * that carry an ordinary SDR, HDR10 or HLG picture underneath play as that picture.
 */
function rangeTypes(c: Capabilities, dolbyVision: boolean): string {
  const list = ['SDR', 'DOVIWithSDR'];
  if (c.hdr) list.push('HDR10', 'HDR10Plus', 'HLG', 'DOVIWithHDR10', 'DOVIWithHDR10Plus', 'DOVIWithHLG');
  if (c.hdr && dolbyVision && c.dolbyVision) list.push('DOVI');
  return list.join('|');
}

/** Builds the Jellyfin DeviceProfile for a browser with the given capabilities. */
export function profileFor(c: Capabilities, maxBitrate: number = MAX_BITRATE, opts: ProfileOptions = {}): Record<string, unknown> {
  const canvas = (opts.subtitles ?? 'canvas') === 'canvas';

  const videoCodecs = join([c.h264 && 'h264', c.hevc && 'hevc', c.av1 && 'av1', c.vp9 && 'vp9']);
  const mp4Audio = join([
    c.aac && 'aac',
    c.mp3 && 'mp3',
    c.opusMp4 && 'opus',
    c.flac && 'flac',
    c.ac3 && 'ac3',
    c.eac3 && 'eac3',
    c.safari && 'alac',
  ]);

  const directPlay: Record<string, unknown>[] = [{ Container: 'mp4,m4v', Type: 'Video', VideoCodec: videoCodecs, AudioCodec: mp4Audio }];
  if (c.chromium) {
    // Chromium plays Matroska even though canPlayType() reports otherwise.
    directPlay.push({
      Container: 'mkv',
      Type: 'Video',
      VideoCodec: videoCodecs,
      AudioCodec: join([mp4Audio, c.vorbis && 'vorbis']),
    });
  }
  if (c.safari) {
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
    directPlay.push({ Container: 'm4a,m4b', AudioCodec: join(['aac', c.safari && 'alac', c.flac && 'flac']), Type: 'Audio' });
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
  // A file marked as Dolby Vision in its container only opens in a Dolby Vision decoder, even when
  // the picture underneath is ordinary HDR10. The server re-wraps those without re-encoding.
  const plainTags = c.dolbyVision
    ? []
    : ['dvh1', 'dvhe', 'dav1', 'dovi'].map((tag) => ({ Condition: 'NotEquals', Property: 'VideoCodecTag', Value: tag, IsRequired: false }));
  if (c.hevc || c.hls.hevc) {
    codecProfiles.push({
      Type: 'Video',
      Codec: 'hevc',
      Conditions: [
        { Condition: 'NotEquals', Property: 'IsAnamorphic', Value: 'true', IsRequired: false },
        { Condition: 'EqualsAny', Property: 'VideoProfile', Value: 'main|main 10', IsRequired: false },
        { Condition: 'EqualsAny', Property: 'VideoRangeType', Value: rangeTypes(c, true), IsRequired: false },
        { Condition: 'LessThanEqual', Property: 'VideoLevel', Value: '183', IsRequired: false },
        { Condition: 'NotEquals', Property: 'IsInterlaced', Value: 'true', IsRequired: false },
        ...plainTags,
      ],
    });
  }
  if (c.av1 || c.hls.av1) {
    codecProfiles.push({
      Type: 'Video',
      Codec: 'av1',
      Conditions: [
        { Condition: 'EqualsAny', Property: 'VideoRangeType', Value: rangeTypes(c, false), IsRequired: false },
        { Condition: 'LessThanEqual', Property: 'VideoBitDepth', Value: '10', IsRequired: false },
        ...plainTags,
      ],
    });
  }
  if (c.vp9) {
    codecProfiles.push({
      Type: 'Video',
      Codec: 'vp9',
      Conditions: [
        { Condition: 'EqualsAny', Property: 'VideoRangeType', Value: c.hdr ? 'SDR|HDR10|HDR10Plus|HLG' : 'SDR', IsRequired: false },
      ],
    });
  }

  // Transcodes. The server uses the first profile, and in it the first video codec it is allowed
  // to encode: AV1 and HEVC need "Allow encoding in AV1/HEVC format" in its playback settings, and
  // it falls back to H.264 without them. The other codecs in a list are passed through untouched
  // when the file already has them. AV1 and HEVC only fit in fMP4 segments; MPEG-TS stays for
  // browsers that have neither.
  const channels = String(c.audioChannels >= 6 ? 6 : 2);
  const transcoding: Record<string, unknown>[] = [];
  if (c.hls.hevc || c.hls.av1) {
    transcoding.push({
      Container: 'mp4',
      Type: 'Video',
      AudioCodec: join(['aac', c.hls.ac3 && 'ac3', c.hls.eac3 && 'eac3', c.hls.opus && 'opus', c.hls.flac && 'flac']),
      VideoCodec: join([c.hls.av1 && 'av1', c.hls.hevc && 'hevc', 'h264']),
      Context: 'Streaming',
      Protocol: 'hls',
      MaxAudioChannels: channels,
      MinSegments: 1,
      BreakOnNonKeyFrames: true,
    });
  }
  transcoding.push(
    {
      Container: 'ts',
      Type: 'Video',
      AudioCodec: join(['aac', c.mp3 && 'mp3']),
      VideoCodec: 'h264',
      Context: 'Streaming',
      Protocol: 'hls',
      MaxAudioChannels: channels,
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
  );

  // The server picks the profile that matches a subtitle track as it is, and otherwise the first
  // one it can convert to. WebVTT therefore comes first: SRT and friends still arrive as WebVTT.
  // With no profile at all, every subtitle is burned into the picture.
  const subtitles: Record<string, unknown>[] =
    opts.subtitles === 'burn'
      ? []
      : [
          { Format: 'vtt', Method: 'External' },
          { Format: 'webvtt', Method: 'External' },
        ];
  // The server never turns styled subtitles into WebVTT by itself: without these it burns them in.
  // A browser that can't draw them fetches their plain-text version from the same address instead.
  if (opts.subtitles !== 'burn') {
    subtitles.push({ Format: 'ass', Method: 'External' }, { Format: 'ssa', Method: 'External' });
  }
  if (canvas && opts.images !== false && c.pgsSubtitles) {
    subtitles.push({ Format: 'pgssub', Method: 'External' });
  }
  // The server has no file to deliver for these; listing them only keeps it from burning them in.
  if (canvas && opts.vobSub) {
    subtitles.push({ Format: 'dvdsub', Method: 'External' });
  }

  return {
    Name: 'Jellyplex Web',
    MaxStreamingBitrate: maxBitrate,
    MaxStaticBitrate: 100_000_000,
    MusicStreamingTranscodingBitrate: 384_000,
    DirectPlayProfiles: directPlay,
    TranscodingProfiles: transcoding,
    ContainerProfiles: [],
    CodecProfiles: codecProfiles,
    SubtitleProfiles: subtitles,
    ResponseProfiles: [{ Type: 'Video', Container: 'm4v', MimeType: 'video/mp4' }],
  };
}

let capabilities: Capabilities | null = null;

/** Builds a Jellyfin DeviceProfile describing what this browser can play natively. */
export function buildDeviceProfile(maxBitrate: number = MAX_BITRATE, opts: ProfileOptions = {}): Record<string, unknown> {
  capabilities ??= probe();
  return profileFor(capabilities, maxBitrate, opts);
}
