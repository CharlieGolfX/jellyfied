import { X } from 'lucide-react';
import { useEffect, useState, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { MediaSourceInfo, MediaStream, SessionInfo } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { formatBitrate, formatBytes } from '@/lib/format';
import type { PlayMethod } from './reporting';
import { t } from '@/i18n';

interface LiveStats {
  width: number;
  height: number;
  dropped: number;
  total: number;
  buffer: number;
  rate: number;
}

function readStats(video: HTMLVideoElement): LiveStats {
  const quality = typeof video.getVideoPlaybackQuality === 'function' ? video.getVideoPlaybackQuality() : null;
  let buffer = 0;
  for (let i = 0; i < video.buffered.length; i++) {
    if (video.buffered.start(i) <= video.currentTime + 0.5 && video.buffered.end(i) >= video.currentTime) {
      buffer = video.buffered.end(i) - video.currentTime;
      break;
    }
  }
  return {
    width: video.videoWidth,
    height: video.videoHeight,
    dropped: quality?.droppedVideoFrames ?? 0,
    total: quality?.totalVideoFrames ?? 0,
    buffer,
    rate: video.playbackRate,
  };
}

function channels(s: MediaStream): string {
  if (s.ChannelLayout) return s.ChannelLayout;
  return s.Channels ? `${s.Channels} ch` : '';
}

const METHOD_LABEL: Record<PlayMethod, string> = {
  DirectPlay: t('player.playbackInfo.directPlay'),
  DirectStream: t('player.playbackInfo.directStream'),
  Transcode: t('player.playbackInfo.transcode'),
};

/** "Stats for nerds": what is being played, how, and why the server is transcoding. */
export function PlaybackInfo({
  videoRef,
  source,
  method,
  isHls,
  audioIndex,
  subIndex,
  transcodeReasons,
  onClose,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  source: MediaSourceInfo;
  method: PlayMethod;
  isHls: boolean;
  audioIndex?: number;
  subIndex: number;
  transcodeReasons: string[];
  onClose: () => void;
}) {
  const api = useApi();
  const [stats, setStats] = useState<LiveStats | null>(null);

  useEffect(() => {
    const update = () => {
      if (videoRef.current) setStats(readStats(videoRef.current));
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [videoRef]);

  // The server knows what the transcoder is really doing (codecs, speed, hardware acceleration).
  const session = useQuery({
    queryKey: ['playback-info-session', api.deviceId],
    queryFn: async () => (await api.get<SessionInfo[]>('/Sessions', { deviceId: api.deviceId }))[0] ?? null,
    enabled: method === 'Transcode',
    refetchInterval: 3000,
    staleTime: 0,
    retry: false,
  });
  const transcode = method === 'Transcode' ? session.data?.TranscodingInfo : undefined;

  const streams = source.MediaStreams ?? [];
  const video = streams.find((s) => s.Type === 'Video');
  const audio = streams.find((s) => s.Type === 'Audio' && s.Index === audioIndex) ?? streams.find((s) => s.Type === 'Audio');
  const subtitle = subIndex >= 0 ? streams.find((s) => s.Type === 'Subtitle' && s.Index === subIndex) : undefined;

  const rows: [string, string][] = [];
  rows.push([t('player.playbackInfo.playMethod'), `${METHOD_LABEL[method]}${isHls ? ' (HLS)' : ''}`]);
  if (transcodeReasons.length) rows.push([t('player.playbackInfo.transcodeReason'), transcodeReasons.join(', ')]);
  if (transcode) {
    const parts = [
      transcode.IsVideoDirect ? 'video copied' : transcode.VideoCodec ? `video → ${transcode.VideoCodec.toUpperCase()}` : '',
      transcode.IsAudioDirect ? 'audio copied' : transcode.AudioCodec ? `audio → ${transcode.AudioCodec.toUpperCase()}` : '',
      transcode.Container ? `in ${transcode.Container.toUpperCase()}` : '',
    ].filter(Boolean);
    if (parts.length) rows.push(['Transcoding', parts.join(', ')]);
    const speed = [
      transcode.Bitrate ? formatBitrate(transcode.Bitrate) : '',
      transcode.Framerate ? `${Math.round(transcode.Framerate)} fps` : '',
      transcode.CompletionPercentage != null ? `${Math.round(transcode.CompletionPercentage)}% done` : '',
      transcode.HardwareAccelerationType && transcode.HardwareAccelerationType !== 'none'
        ? `hardware (${transcode.HardwareAccelerationType})`
        : 'software',
    ].filter(Boolean);
    rows.push([t('player.playbackInfo.transcodeOutput'), speed.join(' · ')]);
  }
  if (stats && stats.width > 0) rows.push([t('player.playbackInfo.playerResolution'), `${stats.width}×${stats.height}`]);
  if (video) {
    rows.push([
      t('player.playbackInfo.sourceVideo'),
      [
        video.Width && video.Height ? `${video.Width}×${video.Height}` : '',
        [video.Codec?.toUpperCase(), video.Profile].filter(Boolean).join(' '),
        video.VideoRangeType && video.VideoRangeType !== 'SDR' ? video.VideoRangeType : (video.VideoRange ?? ''),
        video.BitDepth ? `${video.BitDepth} bit` : '',
        video.RealFrameRate || video.AverageFrameRate
          ? `${(video.RealFrameRate ?? video.AverageFrameRate)!.toFixed(3).replace(/\.?0+$/, '')} fps`
          : '',
        video.BitRate ? formatBitrate(video.BitRate) : '',
      ]
        .filter(Boolean)
        .join(' · '),
    ]);
  }
  if (audio) {
    rows.push([
      t('player.playbackInfo.sourceAudio'),
      [
        audio.Codec?.toUpperCase(),
        channels(audio),
        audio.SampleRate ? `${audio.SampleRate / 1000} kHz` : '',
        audio.BitRate ? formatBitrate(audio.BitRate) : '',
        audio.Language ?? '',
      ]
        .filter(Boolean)
        .join(' · '),
    ]);
  }
  if (subtitle) {
    rows.push([
      'Subtitles',
      [
        subtitle.Codec?.toUpperCase(),
        subtitle.Language ?? '',
        subtitle.DeliveryMethod === 'Encode' ? 'burned in' : subtitle.IsExternal ? 'external file' : 'embedded',
      ]
        .filter(Boolean)
        .join(' · '),
    ]);
  }
  rows.push([
    'Container',
    [source.Container?.toUpperCase(), source.Bitrate ? formatBitrate(source.Bitrate) : '', source.Size ? formatBytes(source.Size) : '']
      .filter(Boolean)
      .join(' · '),
  ]);
  if (stats) {
    rows.push(['Buffer', `${stats.buffer.toFixed(1)} s`]);
    if (stats.total > 0) rows.push([t('player.playbackInfo.droppedFrames'), `${stats.dropped} of ${stats.total}`]);
    if (stats.rate !== 1) rows.push(['Speed', `${stats.rate}×`]);
  }

  return (
    <div
      data-testid="playback-info"
      className="absolute top-20 left-4 z-20 w-[min(30rem,calc(100vw-2rem))] rounded-lg bg-black/75 p-4 text-xs text-white/90 shadow-xl ring-1 ring-white/10 backdrop-blur select-text sm:left-6"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-wider text-white/50 uppercase">{t('player.playbackInfo.playbackInfo')}</span>
        <button
          onClick={onClose}
          className="rounded-full p-1 text-white/60 hover:bg-white/15 hover:text-white"
          aria-label={t('player.playbackInfo.closePlaybackInfo')}
        >
          <X size={14} />
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="whitespace-nowrap text-white/50">{label}</dt>
            <dd className="min-w-0 break-words tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
