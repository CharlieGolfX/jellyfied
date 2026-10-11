import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useEpisodes, useNextUp, useSeasons, useSimilar } from '@/api/queries';
import { generateId } from '@/api/device';
import type { BaseItemDto } from '@/api/types';
import { Hub } from '@/components/media/Hub';
import { PageSpinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { episodeLabel, plural } from '@/lib/format';
import { useAudioPlayer } from '@/player/AudioPlayerProvider';
import type { VideoPlayerState } from '@/player/usePlay';
import { ActionBar, CastHub, CreditsList, DetailFrame, ExpandableText, MetaLine } from './common';
import { EpisodeRow } from './EpisodeList';

export function SeriesDetails({ item }: { item: BaseItemDto }) {
  const seasons = useSeasons(item.Id);
  const nextUp = useNextUp({ seriesId: item.Id, limit: 1 });
  const similar = useSimilar(item.Id);
  const next = nextUp.data?.Items[0];
  const seasonCount = seasons.data?.Items.length ?? 0;

  return (
    <DetailFrame
      item={item}
      header={
        <>
          <MetaLine item={item} extra={seasonCount > 0 ? <span>{plural(seasonCount, 'Season')}</span> : undefined} />
          <div className="pt-2">
            <ActionBar item={item} showShuffle />
          </div>
          {next && (
            <div className="text-sm text-muted">
              Up next:{' '}
              <Link to={`/item/${next.Id}`} className="font-medium text-fg hover:text-accent hover:underline">
                {episodeLabel(next)} · {next.Name}
              </Link>
            </div>
          )}
          <ExpandableText text={item.Overview} className="max-w-4xl pt-1" />
          <div className="max-w-4xl pt-1">
            <CreditsList item={item} />
          </div>
        </>
      }
    >
      <Hub title={seasonCount === 1 ? 'Season' : 'Seasons'} items={seasons.data?.Items} loading={seasons.isLoading} shape="poster" />
      <CastHub people={item.People} />
      <Hub title="More Like This" items={similar.data?.Items} shape="poster" />
    </DetailFrame>
  );
}

/** Plays an episode and queues the rest of the season around it. */
function usePlayEpisodes(episodes: BaseItemDto[]) {
  const navigate = useNavigate();
  const audio = useAudioPlayer();
  return useCallback(
    (episode: BaseItemDto) => {
      const ids = episodes.filter((e) => e.LocationType !== 'Virtual').map((e) => e.Id);
      audio.pause();
      const state: VideoPlayerState = { token: generateId(), queue: ids.length > 1 ? ids : undefined };
      navigate(`/play/${episode.Id}`, { state });
    },
    [episodes, navigate, audio],
  );
}

export function SeasonDetails({ item }: { item: BaseItemDto }) {
  const episodes = useEpisodes(item.SeriesId ?? undefined, item.Id);
  const list = episodes.data?.Items ?? [];
  const play = usePlayEpisodes(list);
  const count = list.length;

  return (
    <DetailFrame
      item={item}
      above={
        item.SeriesId ? (
          <Link to={`/item/${item.SeriesId}`} className="hover:text-fg hover:underline">
            {item.SeriesName}
          </Link>
        ) : undefined
      }
      header={
        <>
          <MetaLine item={item} extra={count > 0 ? <span>{plural(count, 'Episode')}</span> : undefined} />
          <div className="pt-2">
            <ActionBar item={item} showShuffle />
          </div>
          <ExpandableText text={item.Overview} className="max-w-4xl pt-1" />
        </>
      }
    >
      <section className="px-4 sm:px-8 lg:px-10">
        <h2 className="mb-3 text-lg font-semibold">Episodes</h2>
        {episodes.isLoading ? (
          <PageSpinner />
        ) : episodes.error ? (
          <ErrorState error={episodes.error} onRetry={() => episodes.refetch()} />
        ) : (
          <div className="space-y-1">
            {list.map((ep) => (
              <EpisodeRow key={ep.Id} episode={ep} onPlay={() => play(ep)} />
            ))}
          </div>
        )}
      </section>
      <CastHub people={item.People} />
    </DetailFrame>
  );
}
