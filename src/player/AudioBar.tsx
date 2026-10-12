import clsx from 'clsx';
import { ListMusic, Music, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume1, Volume2, VolumeX, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '@/auth/AuthProvider';
import { Img } from '@/components/ui/States';
import { Spinner } from '@/components/ui/Spinner';
import { formatClock, ticksToSeconds } from '@/lib/format';
import type { BaseItemDto } from '@/api/types';
import { useAudioPlayer } from './AudioPlayerProvider';
import { SeekBar } from './SeekBar';
import { useWheelVolume } from './useWheelVolume';
import { t } from '@/i18n';

function useArt(item: BaseItemDto | null, size: number): string | undefined {
  const api = useApi();
  if (!item) return undefined;
  if (item.ImageTags?.Primary) return api.imageUrl(item.Id, 'Primary', { tag: item.ImageTags.Primary, maxWidth: size });
  if (item.AlbumId && item.AlbumPrimaryImageTag)
    return api.imageUrl(item.AlbumId, 'Primary', { tag: item.AlbumPrimaryImageTag, maxWidth: size });
  return undefined;
}

function QueueRow({ item, index, active }: { item: BaseItemDto; index: number; active: boolean }) {
  const player = useAudioPlayer();
  const art = useArt(item, 96);
  return (
    <div className={clsx('group flex items-center gap-3 rounded px-2 py-1.5', active ? 'bg-white/10' : 'hover:bg-white/5')}>
      <button onClick={() => player.jumpTo(index)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-base-800">
          <Img src={art} className="h-full w-full object-cover" fallback={<Music size={16} className="m-3 text-faint" />} />
        </div>
        <div className="min-w-0">
          <div className={clsx('truncate text-sm', active && 'font-semibold text-accent')}>{item.Name}</div>
          <div className="truncate text-xs text-muted">{item.Artists?.join(', ') || item.AlbumArtist}</div>
        </div>
      </button>
      <span className="text-xs text-faint tabular-nums">{formatClock(ticksToSeconds(item.RunTimeTicks))}</span>
      {!active && (
        <button
          onClick={() => player.removeAt(index)}
          className="rounded p-1 text-faint opacity-0 group-hover:opacity-100 hover:text-fg"
          aria-label={t('player.audioBar.removeFromQueue')}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function AudioBar() {
  const player = useAudioPlayer();
  // Turning the wheel over the speaker or its slider changes the volume.
  const volumeRef = useWheelVolume(player.muted ? 0 : player.volume, player.setVolume);
  const [showQueue, setShowQueue] = useState(false);
  const art = useArt(player.current, 200);
  const item = player.current;
  if (!item) return null;

  const VolumeIcon = player.muted || player.volume === 0 ? VolumeX : player.volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="relative z-30 shrink-0 border-t border-black/50 bg-base-850 shadow-[0_-4px_20px_rgba(0,0,0,0.35)]">
      {showQueue && (
        <div className="animate-pop-in absolute right-2 bottom-full mb-2 flex max-h-[60vh] w-96 max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-lg bg-base-750 shadow-2xl ring-1 ring-black/40">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="font-semibold">{t('player.audioBar.playQueue', { count: player.queue.length })}</span>
            <div className="flex gap-1">
              <button
                onClick={player.shuffleQueue}
                className="rounded p-1.5 text-muted hover:bg-white/10 hover:text-fg"
                title={t('player.audioBar.shuffleUpcoming')}
              >
                <Shuffle size={16} />
              </button>
              <button onClick={() => setShowQueue(false)} className="rounded p-1.5 text-muted hover:bg-white/10 hover:text-fg">
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="overflow-y-auto p-2">
            {player.queue.map((q, i) => (
              <QueueRow key={`${q.Id}-${i}`} item={q} index={i} active={i === player.index} />
            ))}
          </div>
        </div>
      )}

      <SeekBar
        className="absolute inset-x-0 -top-1.5"
        current={player.currentTime}
        duration={player.duration}
        onSeek={player.seek}
        compact
      />

      <div className="flex h-[76px] items-center gap-4 px-3 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link
            to={item.AlbumId ? `/item/${item.AlbumId}` : `/item/${item.Id}`}
            className="relative h-14 w-14 shrink-0 overflow-hidden rounded bg-base-800"
          >
            <Img src={art} className="h-full w-full object-cover" fallback={<Music size={22} className="m-4 text-faint" />} />
          </Link>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{item.Name}</div>
            <div className="truncate text-xs text-muted">
              {item.ArtistItems?.length
                ? item.ArtistItems.map((a, i) => (
                    <span key={a.Id}>
                      {i > 0 && ', '}
                      <Link to={`/item/${a.Id}`} className="hover:underline">
                        {a.Name}
                      </Link>
                    </span>
                  ))
                : item.AlbumArtist}
              {item.Album && <span className="text-faint"> — {item.Album}</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={player.cycleRepeat}
            className={clsx('hidden rounded-full p-2 sm:block', player.repeat !== 'off' ? 'text-accent' : 'text-muted hover:text-fg')}
            title={t(`player.audioBar.repeat.${player.repeat}`)}
          >
            {player.repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
          </button>
          <button onClick={player.previous} className="rounded-full p-2 text-fg hover:text-accent" aria-label={t('common.previous')}>
            <SkipBack size={20} fill="currentColor" />
          </button>
          <button
            onClick={player.toggle}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-fg text-base-900 transition hover:scale-105"
            aria-label={player.isPlaying ? t('common.pause') : t('common.play')}
          >
            {player.isLoading && !player.isPlaying ? (
              <Spinner size={20} />
            ) : player.isPlaying ? (
              <Pause size={20} fill="currentColor" />
            ) : (
              <Play size={20} fill="currentColor" className="ml-0.5" />
            )}
          </button>
          <button
            onClick={player.next}
            disabled={player.index >= player.queue.length - 1 && player.repeat !== 'all'}
            className="rounded-full p-2 text-fg hover:text-accent disabled:opacity-30"
            aria-label={t('common.next')}
          >
            <SkipForward size={20} fill="currentColor" />
          </button>
          <span className="hidden w-24 text-center text-xs text-muted tabular-nums md:block">
            {formatClock(player.currentTime)} / {formatClock(player.duration)}
          </span>
        </div>

        <div className="flex flex-1 items-center justify-end gap-1 sm:gap-2">
          <span ref={volumeRef} className="flex items-center">
            <button
              onClick={player.toggleMute}
              className="hidden rounded-full p-2 text-muted hover:text-fg sm:block"
              aria-label={t('player.audioBar.mute')}
            >
              <VolumeIcon size={18} />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={player.muted ? 0 : player.volume}
              onChange={(e) => player.setVolume(Number(e.target.value))}
              className="hidden w-24 lg:block"
              aria-label={t('player.audioBar.volume')}
            />
          </span>
          <button
            onClick={() => setShowQueue((s) => !s)}
            className={clsx('rounded-full p-2', showQueue ? 'text-accent' : 'text-muted hover:text-fg')}
            aria-label={t('player.audioBar.queue')}
          >
            <ListMusic size={18} />
          </button>
          <button onClick={player.stop} className="rounded-full p-2 text-muted hover:text-fg" aria-label={t('player.audioBar.closePlayer')}>
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
