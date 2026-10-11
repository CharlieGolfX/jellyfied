import { X } from 'lucide-react';
import type { SeekSteps } from '../seekSteps';

/** The player's keyboard shortcuts, as shown in the help overlay and listed in the README. */
export function playerShortcuts(steps: SeekSteps): { keys: string[]; action: string }[] {
  return [
    { keys: ['Space', 'K'], action: 'Play / pause' },
    { keys: ['←', 'J'], action: `Back ${steps.back} seconds` },
    { keys: ['→', 'L'], action: `Forward ${steps.forward} seconds` },
    { keys: ['↑', '↓'], action: 'Volume' },
    { keys: ['M'], action: 'Mute' },
    { keys: ['F'], action: 'Full screen' },
    { keys: ['N'], action: 'Next item' },
    { keys: ['P'], action: 'Picture-in-picture' },
    { keys: ['<', '>'], action: 'Slower / faster' },
    { keys: ['G', 'H'], action: 'Subtitles earlier / later' },
    { keys: ['Z', 'X'], action: 'Less / more audio delay' },
    { keys: ['I'], action: 'Playback info' },
    { keys: ['?'], action: 'Show or hide this list' },
    { keys: ['Esc'], action: 'Close menu / minimize to mini player' },
  ];
}

export function ShortcutsHelp({ steps, onClose }: { steps: SeekSteps; onClose: () => void }) {
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      data-testid="shortcuts-help"
    >
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        className="animate-pop-in max-h-full w-full max-w-md overflow-y-auto rounded-lg bg-base-850/95 shadow-2xl ring-1 ring-white/10 backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h2 className="font-semibold">Keyboard shortcuts</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-2 px-5 py-4 text-sm">
          {playerShortcuts(steps).map((s) => (
            <div key={s.action} className="contents">
              <dt className="flex gap-1">
                {s.keys.map((k) => (
                  <kbd key={k} className="min-w-7 rounded bg-white/10 px-1.5 py-0.5 text-center font-sans text-xs font-semibold text-white/90 ring-1 ring-white/15">
                    {k}
                  </kbd>
                ))}
              </dt>
              <dd className="text-white/80">{s.action}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
