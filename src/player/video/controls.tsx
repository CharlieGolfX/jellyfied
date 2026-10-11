import clsx from 'clsx';
import { Check, Minus, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { clampStep } from './shared';
import { t } from '@/i18n';

export function ControlButton({
  label,
  onClick,
  children,
  active,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={clsx(
        'flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-white/15',
        active ? 'text-accent' : 'text-white',
      )}
    >
      {children}
    </button>
  );
}

export function PanelChip({
  selected,
  onClick,
  children,
  title,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={selected}
      className={clsx(
        'rounded px-2 py-1 text-xs font-medium tabular-nums transition-colors',
        selected ? 'bg-accent text-accent-ink' : 'bg-white/10 text-white/80 hover:bg-white/20',
      )}
    >
      {children}
    </button>
  );
}

export function PanelIconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded bg-white/10 text-white/90 transition-colors hover:bg-white/20"
    >
      {children}
    </button>
  );
}

/** Step buttons, the current value and a slider for a timing offset. */
export function DelayControl({
  value,
  onChange,
  min,
  max,
  sliderMin,
  sliderMax,
  step,
  format,
  lessLabel,
  moreLabel,
  sliderLabel,
  testId,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** The slider may cover less than the full range; the buttons reach the rest. */
  sliderMin: number;
  sliderMax: number;
  step: number;
  format: (value: number) => string;
  lessLabel: string;
  moreLabel: string;
  sliderLabel: string;
  testId: string;
}) {
  const set = (v: number) => onChange(clampStep(v, min, max));
  return (
    <div className="px-4 pt-1 pb-2">
      <div className="flex items-center gap-2">
        <PanelIconButton label={lessLabel} onClick={() => set(value - step)}>
          <Minus size={16} />
        </PanelIconButton>
        <span className="w-20 text-center text-sm tabular-nums" data-testid={testId}>
          {format(value)}
        </span>
        <PanelIconButton label={moreLabel} onClick={() => set(value + step)}>
          <Plus size={16} />
        </PanelIconButton>
        {value !== 0 && (
          <button onClick={() => onChange(0)} className="ml-auto rounded px-2 py-1 text-xs text-white/70 hover:bg-white/10">
            {t('common.reset')}
          </button>
        )}
      </div>
      <input
        type="range"
        min={sliderMin}
        max={sliderMax}
        step={step}
        value={Math.min(sliderMax, Math.max(sliderMin, value))}
        onChange={(e) => set(Number(e.target.value))}
        aria-label={sliderLabel}
        className="mt-3 block w-full"
      />
      <div className="mt-0.5 flex justify-between text-[10px] text-white/40 tabular-nums">
        <span>{format(sliderMin)}</span>
        <span>{format(sliderMax)}</span>
      </div>
    </div>
  );
}

export function Panel({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div
      className={clsx(
        // On phones the panel is pinned to the screen edge: next to its button it would run off the left side.
        'animate-pop-in absolute right-0 bottom-14 max-h-[60vh] overflow-y-auto rounded-lg bg-base-850/95 py-1 shadow-2xl ring-1 ring-white/10 backdrop-blur max-sm:fixed max-sm:right-3 max-sm:bottom-20',
        wide ? 'w-96 max-w-[calc(100vw-2rem)]' : 'w-72',
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

export function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="py-1">
      <div className="px-4 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-white/40 uppercase">{title}</div>
      {children}
    </div>
  );
}

export function PanelOption({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-white/10',
        selected ? 'text-accent' : 'text-white/90',
      )}
    >
      <Check size={16} className={clsx('shrink-0', !selected && 'invisible')} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}
