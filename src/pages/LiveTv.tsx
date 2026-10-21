import clsx from 'clsx';
import { Play, Tv } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cardImage, imageSrc } from '@/api/images';
import { CARD_FIELDS, MEDIA } from '@/api/queries';
import type { BaseItemDto, ItemsResult } from '@/api/types';
import { useApi, useSession } from '@/auth/AuthProvider';
import { CardGrid } from '@/components/media/CardGrid';
import { LibraryIcon } from '@/components/layout/libraryIcon';
import { PageSpinner } from '@/components/ui/Spinner';
import { EmptyState, ErrorState, Img } from '@/components/ui/States';
import { Guide } from './liveTv/Guide';
import { Scheduled } from './liveTv/Scheduled';
import { programProgress, ProgramTimes, useNow, usePlayChannel } from './liveTv/shared';
import { t } from '@/i18n';

export { programProgress };

type TabId = 'channels' | 'guide' | 'now' | 'recordings';
const TABS: { id: TabId; label: string }[] = [
  { id: 'channels', label: t('liveTv.channels') },
  { id: 'guide', label: t('liveTv.guide') },
  { id: 'now', label: t('liveTv.onNow') },
  { id: 'recordings', label: t('liveTv.recordings') },
];

/** The channels, each with what is on it now. Shared by the channel list and the guide. */
function useChannels() {
  const api = useApi();
  const { userId } = useSession();
  return useQuery({
    queryKey: [MEDIA, 'livetv', 'channels', userId],
    queryFn: () =>
      api.get<ItemsResult>('/LiveTv/Channels', {
        userId,
        addCurrentProgram: true,
        enableImageTypes: ['Primary'],
        imageTypeLimit: 1,
        enableUserData: false,
        sortBy: 'SortName',
      }),
    // What is on changes all the time.
    refetchInterval: 5 * 60_000,
  });
}

function Channels() {
  const api = useApi();
  const playChannel = usePlayChannel();
  const now = useNow();
  const { data, isLoading, error, refetch } = useChannels();

  if (isLoading) return <PageSpinner />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  const channels = data?.Items ?? [];
  if (channels.length === 0) {
    return (
      <EmptyState icon={<Tv size={48} strokeWidth={1.25} />} title={t('liveTv.noChannels')}>
        {t('liveTv.liveTvHasNoChannels')}
      </EmptyState>
    );
  }

  return (
    <ul className="px-2 pt-4 sm:px-6 lg:px-8" data-testid="livetv-channels">
      {channels.map((channel) => {
        const program = channel.CurrentProgram;
        const progress = programProgress(program, now);
        return (
          <li key={channel.Id}>
            <button
              onClick={() => void playChannel(channel.Id, channel.Name)}
              className="group flex w-full items-center gap-4 rounded-md px-2 py-2 text-left transition-colors hover:bg-white/5"
              aria-label={t('liveTv.watch', { name: channel.Name })}
            >
              <span className="w-10 shrink-0 text-right text-sm text-muted tabular-nums">{channel.ChannelNumber}</span>
              <span className="relative flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-base-800 text-faint">
                <Img
                  src={imageSrc(api, cardImage(channel, 'landscape'), 240)}
                  className="absolute inset-0 h-full w-full object-contain p-1"
                  fallback={<Tv size={20} />}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{channel.Name}</span>
                <span className="block truncate text-sm text-muted">
                  {program ? (
                    <>
                      {program.Name}
                      <span className="text-faint">
                        {' · '}
                        <ProgramTimes program={program} />
                      </span>
                    </>
                  ) : (
                    t('liveTv.noGuideInformation')
                  )}
                </span>
                {progress !== null && (
                  <span className="mt-1.5 block h-0.5 max-w-md overflow-hidden rounded bg-white/10">
                    <span className="block h-full bg-accent" style={{ width: `${progress}%` }} />
                  </span>
                )}
              </span>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-fg transition-colors group-hover:bg-accent-fill group-hover:text-accent-ink">
                <Play size={16} fill="currentColor" className="ml-0.5" />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function OnNow() {
  const api = useApi();
  const { userId } = useSession();
  const playChannel = usePlayChannel();
  const now = useNow();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [MEDIA, 'livetv', 'now', userId],
    queryFn: () =>
      api.get<ItemsResult>('/LiveTv/Programs/Recommended', {
        userId,
        isAiring: true,
        limit: 60,
        imageTypeLimit: 1,
        enableImageTypes: ['Primary', 'Thumb', 'Backdrop'],
        fields: ['ChannelInfo', 'PrimaryImageAspectRatio'],
        enableTotalRecordCount: false,
      }),
    refetchInterval: 5 * 60_000,
  });

  if (isLoading) return <PageSpinner />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  const programs = (data?.Items ?? []).filter((p) => p.ChannelId);
  if (programs.length === 0) return <EmptyState title={t('liveTv.nothingInTheGuideRight')} />;

  return (
    <div
      className="grid gap-x-5 gap-y-6 px-4 pt-6 sm:px-8 lg:px-10"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(calc(240px * var(--card-scale)), 42vw), 1fr))' }}
    >
      {programs.map((program) => {
        const progress = programProgress(program, now);
        return (
          <button
            key={program.Id}
            onClick={() => void playChannel(program.ChannelId!, program.ChannelName)}
            className="group min-w-0 text-left"
          >
            <span className="relative block aspect-video overflow-hidden rounded-md bg-base-800 shadow-md ring-white/0 transition-[box-shadow] group-hover:ring-2 group-hover:ring-accent">
              <Img
                src={imageSrc(api, cardImage(program, 'landscape'), 560)}
                className="absolute inset-0 h-full w-full object-cover"
                fallback={
                  <span className="absolute inset-0 flex items-center justify-center text-faint">
                    <Tv size={36} strokeWidth={1.25} />
                  </span>
                }
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-fill text-accent-ink shadow-lg">
                  <Play size={22} fill="currentColor" className="ml-0.5" />
                </span>
              </span>
              {progress !== null && (
                <span className="absolute inset-x-0 bottom-0 h-1 bg-black/60">
                  <span className="block h-full bg-accent" style={{ width: `${progress}%` }} />
                </span>
              )}
            </span>
            <span className="mt-2 block truncate text-sm font-medium">{program.Name}</span>
            <span className="block truncate text-xs text-muted">
              {program.ChannelName}
              {program.StartDate && program.EndDate && (
                <>
                  {' · '}
                  <ProgramTimes program={program} />
                </>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function GuideTab() {
  const { data, isLoading, error, refetch } = useChannels();
  if (isLoading) return <PageSpinner />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  return <Guide channels={data?.Items ?? []} />;
}

function Recordings() {
  const api = useApi();
  const { userId } = useSession();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [MEDIA, 'livetv', 'recordings', userId],
    queryFn: () =>
      api.get<ItemsResult>('/LiveTv/Recordings', {
        userId,
        fields: CARD_FIELDS,
        enableImageTypes: ['Primary', 'Thumb', 'Backdrop'],
        imageTypeLimit: 1,
        enableUserData: true,
        limit: 300,
      }),
  });
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  return (
    <>
      <Scheduled />
      {!isLoading && (data?.Items.length ?? 0) === 0 ? (
        <EmptyState title={t('liveTv.noRecordings')}>{t('liveTv.recordingsHint')}</EmptyState>
      ) : (
        <div className="px-4 pt-6 sm:px-8 lg:px-10">
          <CardGrid items={data?.Items ?? []} shape="landscape" loading={isLoading} />
        </div>
      )}
    </>
  );
}

/** Live TV: the channels with what is on, the guide, what is airing now, and the recordings (made and to come). */
export default function LiveTvPage({ library }: { library: BaseItemDto }) {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((option) => option.id === params.get('tab'))?.id ?? 'channels';

  return (
    <div className="pb-10">
      <div className="sticky top-0 z-20 border-b border-white/5 bg-base-900/90 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-8 lg:px-10">
          <div className="flex items-center gap-2.5 text-lg font-semibold">
            <span className="text-accent">
              <LibraryIcon type="livetv" size={22} />
            </span>
            {library.Name}
          </div>
          <div className="flex gap-1 overflow-x-auto scrollbar-none">
            {TABS.map((option) => (
              <button
                key={option.id}
                onClick={() => setParams({ tab: option.id }, { replace: true })}
                className={clsx(
                  'relative h-9 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors',
                  tab === option.id ? 'text-fg' : 'text-muted hover:text-fg',
                )}
              >
                {option.label}
                {tab === option.id && <span className="absolute inset-x-3 -bottom-[13px] h-[3px] rounded-t bg-accent" />}
              </button>
            ))}
          </div>
        </div>
      </div>
      {tab === 'channels' && <Channels />}
      {tab === 'guide' && <GuideTab />}
      {tab === 'now' && <OnNow />}
      {tab === 'recordings' && <Recordings />}
    </div>
  );
}
