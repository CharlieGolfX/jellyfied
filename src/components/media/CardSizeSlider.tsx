import clsx from 'clsx';
import { RectangleVertical } from 'lucide-react';
import { CARD_SCALE_MAX, CARD_SCALE_MIN, useCardScale } from '@/lib/cardScale';
import { t } from '@/i18n';

/** Poster size slider. The setting is global and persisted. */
export function CardSizeSlider({ className }: { className?: string }) {
  const [scale, setScale] = useCardScale();
  return (
    <div className={clsx('flex items-center gap-2 text-muted', className)} title={t('media.cardSizeSlider.posterSize')}>
      <button
        type="button"
        onClick={() => setScale(scale - 0.1)}
        className="rounded p-0.5 hover:text-fg"
        aria-label={t('media.cardSizeSlider.smallerPosters')}
      >
        <RectangleVertical size={11} />
      </button>
      <input
        type="range"
        min={CARD_SCALE_MIN}
        max={CARD_SCALE_MAX}
        step={0.05}
        value={scale}
        onChange={(e) => setScale(Number(e.target.value))}
        onDoubleClick={() => setScale(1)}
        className="w-28"
        aria-label={t('media.cardSizeSlider.posterSize')}
      />
      <button
        type="button"
        onClick={() => setScale(scale + 0.1)}
        className="rounded p-0.5 hover:text-fg"
        aria-label={t('media.cardSizeSlider.largerPosters')}
      >
        <RectangleVertical size={17} />
      </button>
    </div>
  );
}
