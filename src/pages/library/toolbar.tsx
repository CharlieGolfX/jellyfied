import clsx from 'clsx';
import { ChevronDown, LayoutGrid, List } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { useLibraryView } from '@/lib/libraryView';
import { t } from '@/i18n';

export const FILTERS = [
  { value: '', label: t('library.toolbar.all') },
  { value: 'IsUnplayed', label: t('common.unwatched') },
  { value: 'IsPlayed', label: t('library.toolbar.watched') },
  { value: 'IsResumable', label: t('library.toolbar.inProgress') },
  { value: 'IsFavorite', label: t('library.toolbar.favorites') },
];

export const RESOLUTIONS = [
  { value: '4k', label: '4K', query: { is4K: true } },
  { value: 'hd', label: t('library.toolbar.hd'), query: { isHd: true, is4K: false } },
  { value: 'sd', label: t('library.toolbar.sd'), query: { isHd: false } },
] as const;
/** Item types that are single video files, so they have a resolution. */
export const HAS_RESOLUTION = new Set(['Movie', 'Video', 'MusicVideo', 'Episode']);
/** Item types whose metadata carries studios. */
export const HAS_STUDIOS = new Set(['Movie', 'Series']);

const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

/** A–Z strip that moves a list sorted by title to a letter; the rest of the list stays above and below. */
export function AlphabetBar({ value, onChange }: { value: string; onChange: (letter: string | null) => void }) {
  return (
    <div
      className="scrollbar-none -mx-1 flex gap-0.5 overflow-x-auto"
      role="group"
      aria-label={t('library.toolbar.jumpToALetter')}
      data-testid="alphabet-bar"
    >
      {LETTERS.map((l) => (
        <button
          key={l}
          onClick={() => onChange(value === l ? null : l)}
          aria-pressed={value === l}
          title={l === '#' ? t('library.toolbar.goToTitlesThatStart') : t('library.toolbar.goToTitlesThatStart2', { l })}
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

/**
 * The library's tools (sorting, filters, the A–Z bar): they stay in reach under the library's
 * header, however far the list has been scrolled or jumped.
 */
export function StickyTools({ children }: { children: ReactNode }) {
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
      data-library-tools
      className="sticky z-10 -mx-4 mb-3 space-y-2 bg-base-900/90 px-4 py-2 backdrop-blur-md sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10"
      style={{ top }}
    >
      {children}
    </div>
  );
}

/** Switches a library between cards and rows. */
export function ViewToggle() {
  const [view, setView] = useLibraryView();
  return (
    <div className="flex rounded-md bg-white/5 p-0.5" role="group" aria-label={t('library.toolbar.layout')}>
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

/** A group of tools. On narrow screens it is one line that scrolls sideways, so the tools that stick to the top stay low. */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 items-center gap-2 md:shrink md:flex-wrap">{children}</div>;
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
  kind,
  options,
  selected,
  onChange,
}: {
  /** What is filtered on; its wording is under "library.filter" in the language files. */
  kind: 'genre' | 'year' | 'rating' | 'tag' | 'studio';
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const first = options.find((o) => o.value === selected[0])?.label ?? selected[0];
  return (
    <DropdownButton
      label={
        selected.length === 0
          ? t(`library.filter.${kind}.name`)
          : selected.length === 1
            ? first
            : t(`library.filter.${kind}.count`, { count: selected.length })
      }
      active={selected.length > 0}
      items={[
        { label: t(`library.filter.${kind}.all`), checked: selected.length === 0, onSelect: () => onChange([]) },
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
