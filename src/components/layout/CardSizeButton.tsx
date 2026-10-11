import clsx from 'clsx';
import { ZoomIn } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CardSizeSlider } from '@/components/media/CardSizeSlider';
import { t } from '@/i18n';

/** Top-bar control for the global poster size, available on every browsing page. */
export function CardSizeButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t('layout.cardSizeButton.posterSize')}
        title={t('layout.cardSizeButton.posterSize')}
        className={clsx('rounded-full p-2 hover:bg-white/10', open ? 'text-accent' : 'text-muted hover:text-fg')}
      >
        <ZoomIn size={20} />
      </button>
      {open && (
        <div className="animate-pop-in absolute top-12 right-0 z-50 rounded-lg bg-base-750 px-4 py-3 shadow-2xl ring-1 ring-black/40">
          <div className="mb-2 text-[11px] font-semibold tracking-wider text-faint uppercase">{t('layout.cardSizeButton.posterSize')}</div>
          <CardSizeSlider />
        </div>
      )}
    </div>
  );
}
