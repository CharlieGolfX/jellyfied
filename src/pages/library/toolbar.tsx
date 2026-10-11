import clsx from 'clsx';
import { ChevronDown, LayoutGrid, List } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { useLibraryView } from '@/lib/libraryView';

export const FILTERS = [
  { value: '', label: 'All' },
  { value: 'IsUnplayed', label: 'Unwatched' },
  { value: 'IsPlayed', label: 'Watched' },
  { value: 'IsResumable', label: 'In Progress' },
  { value: 'IsFavorite', label: 'Favorites' },
];

export const RESOLUTIONS = [
  { value: '4k', label: '4K', query: { is4K: true } },
  { value: 'hd', label: 'HD', query: { isHd: true, is4K: false } },
  { value: 'sd', label: 'SD', query: { isHd: false } },
] as const;
/** Item types that are single video files, so they have a resolution. */
export const HAS_RESOLUTION = new Set(['Movie', 'Video', 'MusicVideo', 'Episode']);
/** Item types whose metadata carries studios. */
export const HAS_STUDIOS = new Set(['Movie', 'Series']);

const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

/** A–Z strip that moves a list sorted by title to a letter; the rest of the list stays above and below. */
export function AlphabetBar({ value, onChange }: { value: string; onChange: (letter: string | null) => void }) {
  // The bar stays in reach under the library's header, however far the list has been scrolled.
  const [top, setTop] = useState(0);
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('[data-library-header]');
    if (!header) return;
    const measure = () => setTop(header.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="scrollbar-none sticky z-10 -mx-4 mb-3 flex gap-0.5 overflow-x-auto bg-base-900/90 px-3 py-1.5 backdrop-blur-md sm:-mx-8 sm:px-7 lg:-mx-10 lg:px-9"
      style={{ top }}
      role="group"
      aria-label="Jump to a letter"
      data-testid="alphabet-bar"
    >
      {LETTERS.map((l) => (
        <button
          key={l}
          onClick={() => onChange(value === l ? null : l)}
          aria-pressed={value === l}
          title={l === '#' ? 'Go to titles that start with a number or symbol' : `Go to titles that start with ${l}`}
          className={clsx(
            'h-7 min-w-7 shrink-0 rounded px-1.5 text-xs font-semibold transition-colors',
            value === l ? 'bg-accent text-accent-ink' : 'text-muted hover:bg-white/10 hover:text-fg',
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/** Switches a library between cards and rows. */
export function ViewToggle() {
  const [view, setView] = useLibraryView();
  return (
    <div className="flex rounded-md bg-white/5 p-0.5" role="group" aria-label="Layout">
      {(
        [
          ['grid', 'Grid', <LayoutGrid size={15} key="g" />],
          ['list', 'List', <List size={15} key="l" />],
        ] as const
      ).map(([value, label, icon]) => (
        <button
          key={value}
          onClick={() => setView(value)}
          aria-pressed={view === value}
          aria-label={`${label} view`}
          title={`${label} view`}
          className={clsx(
            'flex h-7 w-8 items-center justify-center rounded',
            view === value ? 'bg-white/15 text-fg' : 'text-muted hover:text-fg',
          )}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

export function DropdownButton({
  label,
  active,
  items,
  icon,
}: {
  label: ReactNode;
  active?: boolean;
  items: MenuItem[];
  icon?: ReactNode;
}) {
  return (
    <Menu
      align="left"
      items={items}
      trigger={({ toggle, open }) => (
        <button
          onClick={toggle}
          aria-expanded={open}
          className={clsx(
            'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors',
            active ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-white/10 hover:text-fg',
          )}
        >
          {icon}
          {label}
          <ChevronDown size={14} />
        </button>
      )}
    />
  );
}

/** A filter menu where several values can be ticked; titles matching any of them are shown. */
export function MultiFilter({
  name,
  plural,
  options,
  selected,
  onChange,
}: {
  /** "Genre" */
  name: string;
  /** "genres" */
  plural: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const first = options.find((o) => o.value === selected[0])?.label ?? selected[0];
  return (
    <DropdownButton
      label={selected.length === 0 ? name : selected.length === 1 ? first : `${selected.length} ${plural}`}
      active={selected.length > 0}
      items={[
        { label: `All ${plural}`, checked: selected.length === 0, onSelect: () => onChange([]) },
        { divider: true, label: '' },
        ...options.map((o) => ({
          label: o.label,
          checked: selected.includes(o.value),
          keepOpen: true,
          onSelect: () => onChange(selected.includes(o.value) ? selected.filter((v) => v !== o.value) : [...selected, o.value]),
        })),
      ]}
    />
  );
}
