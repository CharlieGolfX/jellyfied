import clsx from 'clsx';
import { Play } from 'lucide-react';
import { cardImage, imageSrc } from '@/api/images';
import type { BaseItemDto } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { Img } from '@/components/ui/States';
import { episodeLabel } from '@/lib/format';
import { t } from '@/i18n';

export function UpNextCard({
  item,
  seconds,
  raised,
  onPlay,
  onCancel,
}: {
  item: BaseItemDto;
  /** Countdown until auto-play, or null when auto-play is off. */
  seconds: number | null;
  raised: boolean;
  onPlay: () => void;
  onCancel: () => void;
}) {
  const api = useApi();
  const src = imageSrc(api, cardImage(item, 'landscape'), 480);
  return (
    <div
      className={clsx(
        'animate-pop-in absolute right-6 z-20 w-80 overflow-hidden rounded-lg bg-base-850/95 shadow-2xl ring-1 ring-white/10 backdrop-blur transition-all',
        raised ? 'bottom-36' : 'bottom-8',
      )}
    >
      <div className="relative aspect-video bg-base-800">
        <Img src={src} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute bottom-2 left-3 text-xs font-semibold tracking-wider text-accent uppercase">
          {seconds === null ? t('player.video.upNextCard.upNext') : t('player.video.upNextCard.upNextInS', { seconds })}
        </div>
      </div>
      <div className="p-3">
        <div className="truncate font-semibold">{item.Type === 'Episode' ? item.SeriesName : item.Name}</div>
        {item.Type === 'Episode' && (
          <div className="truncate text-sm text-muted">
            {episodeLabel(item)} · {item.Name}
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <button
            onClick={onPlay}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent py-2 text-sm font-semibold text-accent-ink hover:bg-accent-hover"
          >
            <Play size={16} fill="currentColor" /> {t('player.video.upNextCard.playNow')}
          </button>
          <button onClick={onCancel} className="rounded-md bg-white/10 px-4 py-2 text-sm hover:bg-white/20">
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
