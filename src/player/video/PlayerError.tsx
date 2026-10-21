import clsx from 'clsx';
import { t } from '@/i18n';

/** Covers the player when playback failed, with ways to try again or leave. */
export function PlayerError({
  message,
  full,
  onRetry,
  onTranscode,
  onExit,
}: {
  message: string;
  /** The full-screen player; the mini player has room for less. */
  full: boolean;
  onRetry: () => void;
  /** Offered when the server isn't transcoding already. */
  onTranscode?: () => void;
  onExit: () => void;
}) {
  return (
    <div
      className={clsx(
        'absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 text-center',
        full ? 'gap-4 px-6' : 'gap-2 px-3 text-sm',
      )}
    >
      <p className={clsx('max-w-lg text-fg', !full && 'line-clamp-3')}>{message}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button onClick={onRetry} className="rounded-md bg-accent-fill px-4 py-2 font-semibold text-accent-ink hover:bg-accent-fill-hover">
          {t('player.videoPlayer.retry')}
        </button>
        {onTranscode && (
          <button onClick={onTranscode} className="rounded-md bg-white/10 px-4 py-2 hover:bg-white/20">
            {t('player.videoPlayer.tryTranscoding')}
          </button>
        )}
        <button onClick={onExit} className="rounded-md bg-white/10 px-4 py-2 hover:bg-white/20">
          {full ? t('player.videoPlayer.goBack') : t('common.close')}
        </button>
      </div>
    </div>
  );
}
