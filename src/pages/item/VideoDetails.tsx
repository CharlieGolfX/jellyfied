import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useEpisodes, useSimilar, useSpecialFeatures } from '@/api/queries';
import type { BaseItemDto, MediaStream } from '@/api/types';
import { useCurrentUser, useIsAdmin } from '@/auth/AuthProvider';
import { Hub } from '@/components/media/Hub';
import { episodeLabel, formatBitrate, formatBytes, formatDate } from '@/lib/format';
import { recallTracks, rememberAudioTrack, rememberSubtitleTrack } from '@/player/trackMemory';
import { ActionBar, CastHub, CreditsList, DetailFrame, ExpandableText, MetaLine } from './common';
import { t } from '@/i18n';

function streamLabel(s: MediaStream): string {
  return s.DisplayTitle || [s.Language, s.Codec?.toUpperCase()].filter(Boolean).join(' ') || t('player.trackNumber', { number: s.Index });
}

function StreamSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex min-w-0 items-center gap-3 text-sm">
      <span className="w-20 shrink-0 font-medium text-faint">{label}</span>
      {options.length > 1 ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 max-w-full min-w-0 truncate rounded bg-white/5 px-2 text-fg ring-1 ring-white/10 hover:bg-white/10 focus:ring-accent focus:outline-none"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-base-800">
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <span className="truncate text-fg/90">{options[0]?.label ?? t('common.none')}</span>
      )}
    </label>
  );
}

export function VideoDetails({ item }: { item: BaseItemDto }) {
  const isAdmin = useIsAdmin();
  const sources = item.MediaSources ?? [];
  const [sourceId, setSourceId] = useState(sources[0]?.Id ?? '');
  const source = sources.find((s) => s.Id === sourceId) ?? sources[0];
  const streams = source?.MediaStreams ?? item.MediaStreams ?? [];
  const videoStreams = streams.filter((s) => s.Type === 'Video');
  const audioStreams = streams.filter((s) => s.Type === 'Audio');
  const subtitleStreams = streams.filter((s) => s.Type === 'Subtitle');

  const [audioIndex, setAudioIndex] = useState<number | undefined>(undefined);
  const [subtitleIndex, setSubtitleIndex] = useState<number | undefined>(undefined);
  const isEpisode = item.Type === 'Episode';
  // Episodes start with the tracks last chosen for their show (see trackMemory.ts).
  const { data: user } = useCurrentUser();
  const seriesId = isEpisode ? item.SeriesId : undefined;
  const rememberAudio = user?.Configuration?.RememberAudioSelections !== false;
  const rememberSubtitles = user?.Configuration?.RememberSubtitleSelections !== false;
  const remembered = recallTracks(seriesId, streams, { audio: rememberAudio, subtitle: rememberSubtitles });
  const effectiveAudio = audioIndex ?? remembered.audioIndex ?? source?.DefaultAudioStreamIndex ?? audioStreams[0]?.Index;
  const effectiveSub = subtitleIndex ?? remembered.subtitleIndex ?? source?.DefaultSubtitleStreamIndex ?? -1;

  const episodes = useEpisodes(isEpisode ? (item.SeriesId ?? undefined) : undefined, item.SeasonId ?? undefined);
  const extras = useSpecialFeatures(item.Id, (item.SpecialFeatureCount ?? 0) > 0 || item.Type === 'Movie');
  const similar = useSimilar(item.Id, item.Type === 'Movie' || item.Type === 'MusicVideo' || item.Type === 'Video');

  const otherEpisodes = useMemo(() => episodes.data?.Items, [episodes.data]);

  const above = isEpisode ? (
    <span>
      <Link to={`/item/${item.SeriesId}`} className="hover:text-fg hover:underline">
        {item.SeriesName}
      </Link>
      {item.SeasonId && (
        <>
          <span className="mx-2 text-faint">›</span>
          <Link to={`/item/${item.SeasonId}`} className="hover:text-fg hover:underline">
            {item.SeasonName ?? t('item.videoDetails.season', { parentIndexNumber: item.ParentIndexNumber })}
          </Link>
        </>
      )}
    </span>
  ) : undefined;

  return (
    <DetailFrame
      item={item}
      shape={isEpisode || item.Type === 'Video' ? 'landscape' : 'poster'}
      above={above}
      header={
        <>
          <MetaLine
            item={item}
            extra={
              isEpisode ? (
                <span className="text-fg/90">
                  {[
                    episodeLabel(item, true),
                    item.PremiereDate ? t('item.videoDetails.aired', { date: formatDate(item.PremiereDate) }) : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              ) : undefined
            }
          />
          {item.Taglines?.[0] && <p className="text-lg text-muted italic">{item.Taglines[0]}</p>}
          <div className="pt-2">
            <ActionBar
              item={item}
              playOptions={{
                mediaSourceId: source?.Id,
                audioStreamIndex: effectiveAudio ?? undefined,
                subtitleStreamIndex: effectiveSub,
              }}
            />
          </div>
          <ExpandableText text={item.Overview} className="max-w-4xl pt-2" />
          <div className="max-w-4xl pt-1">
            <CreditsList item={item} />
          </div>

          {source && (
            <div className="grid max-w-4xl gap-2 pt-3 lg:grid-cols-2">
              {sources.length > 1 && (
                <StreamSelect
                  label={t('item.videoDetails.version')}
                  value={source.Id}
                  options={sources.map((s) => ({ value: s.Id, label: s.Name ?? s.Container ?? s.Id }))}
                  onChange={(v) => {
                    setSourceId(v);
                    setAudioIndex(undefined);
                    setSubtitleIndex(undefined);
                  }}
                />
              )}
              {videoStreams[0] && (
                <StreamSelect
                  label={t('item.videoDetails.video')}
                  value={String(videoStreams[0].Index)}
                  options={[{ value: String(videoStreams[0].Index), label: streamLabel(videoStreams[0]) }]}
                  onChange={() => {}}
                />
              )}
              <StreamSelect
                label={t('item.videoDetails.audio')}
                value={String(effectiveAudio ?? '')}
                options={
                  audioStreams.length
                    ? audioStreams.map((s) => ({ value: String(s.Index), label: streamLabel(s) }))
                    : [{ value: '', label: t('common.none') }]
                }
                onChange={(v) => {
                  setAudioIndex(Number(v));
                  if (seriesId && rememberAudio)
                    rememberAudioTrack(
                      seriesId,
                      audioStreams.find((s) => s.Index === Number(v)),
                    );
                }}
              />
              <StreamSelect
                label={t('common.subtitles')}
                value={String(effectiveSub)}
                options={[
                  { value: '-1', label: t('common.none') },
                  ...subtitleStreams.map((s) => ({ value: String(s.Index), label: streamLabel(s) })),
                ]}
                onChange={(v) => {
                  setSubtitleIndex(Number(v));
                  if (seriesId && rememberSubtitles)
                    rememberSubtitleTrack(
                      seriesId,
                      subtitleStreams.find((s) => s.Index === Number(v)),
                    );
                }}
              />
            </div>
          )}

          {source && (
            <details className="max-w-4xl pt-2 text-sm text-muted">
              <summary className="cursor-pointer text-faint select-none hover:text-fg">{t('item.videoDetails.mediaInfo')}</summary>
              <div className="mt-2 space-y-1 rounded-md bg-black/30 p-3 font-mono text-xs leading-relaxed">
                <div>
                  {source.Container?.toUpperCase()} · {formatBytes(source.Size)} · {formatBitrate(source.Bitrate)}
                </div>
                {streams.map((s) => (
                  <div key={s.Index}>
                    <span className="text-faint">{s.Type}:</span> {streamLabel(s)}
                    {s.Type === 'Video' && s.Width ? ` · ${s.Width}×${s.Height}` : ''}
                    {s.BitRate ? ` · ${formatBitrate(s.BitRate)}` : ''}
                  </div>
                ))}
                {isAdmin && source.Path && <div className="break-all text-faint">{source.Path}</div>}
              </div>
            </details>
          )}
        </>
      }
    >
      {isEpisode && (
        <Hub
          title={item.SeasonName ? t('item.videoDetails.moreFrom', { seasonName: item.SeasonName }) : t('item.videoDetails.moreEpisodes')}
          to={item.SeasonId ? `/item/${item.SeasonId}` : undefined}
          items={otherEpisodes}
          shape="landscape"
          cardProps={{ context: 'series' }}
        />
      )}
      <CastHub people={item.People} />
      <Hub title={t('item.videoDetails.extras')} items={extras.data} shape="landscape" />
      <Hub title={t('item.videoDetails.moreLikeThis')} items={similar.data?.Items} shape="poster" />
    </DetailFrame>
  );
}
