import clsx from 'clsx';
import { Check } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';

export interface MenuItem {
  label: ReactNode;
  icon?: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  /** Leave the menu open after this item is picked, for lists where several can be ticked. */
  keepOpen?: boolean;
  divider?: boolean;
  header?: boolean;
}

interface MenuProps {
  trigger: (props: { open: boolean; toggle: (e: ReactMouseEvent) => void }) => ReactNode;
  items: MenuItem[];
  align?: 'left' | 'right';
  width?: number;
  className?: string;
}

/** Dropdown menu rendered in a portal so it is never clipped by scrolling containers. */
export function Menu({ trigger, items, align = 'right', width = 224, className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  const close = useCallback(() => setOpen(false), []);

  const toggle = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen((o) => !o);
  }, []);

  const place = useCallback(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    let left = align === 'right' ? rect.right - width : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    let top = rect.bottom + 6;
    const spaceBelow = window.innerHeight - top - 8;
    if (menuHeight > spaceBelow && rect.top - 6 > spaceBelow) {
      top = Math.max(8, rect.top - 6 - Math.min(menuHeight, rect.top - 14));
    }
    setPos({ top, left, maxHeight: Math.max(160, window.innerHeight - top - 8) });
  }, [align, width]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    // The menu follows its button while the page scrolls, and closes once the button is out of sight.
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) close();
      else place();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close, place]);

  return (
    <span ref={anchorRef} className={clsx('inline-flex', className)}>
      {trigger({ open, toggle })}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="animate-pop-in fixed z-[200] overflow-y-auto rounded-md bg-base-750 py-1.5 shadow-2xl ring-1 ring-black/40"
            style={{
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              width,
              maxHeight: pos?.maxHeight,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {items.map((item, i) => {
              if (item.divider) return <div key={i} className="my-1.5 h-px bg-white/10" />;
              if (item.header)
                return (
                  <div key={i} className="px-3.5 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-faint uppercase">
                    {item.label}
                  </div>
                );
              return (
                <button
                  key={i}
                  role={item.keepOpen ? 'menuitemcheckbox' : 'menuitem'}
                  aria-checked={item.keepOpen ? Boolean(item.checked) : undefined}
                  disabled={item.disabled}
                  onClick={(e) => {
                    e.preventDefault();
                    if (!item.keepOpen) close();
                    item.onSelect?.();
                  }}
                  className={clsx(
                    'flex w-full items-center gap-3 px-3.5 py-2 text-left text-sm transition-colors disabled:opacity-40',
                    item.danger ? 'text-danger hover:bg-danger/15' : 'text-fg hover:bg-white/10',
                  )}
                >
                  {item.checked !== undefined ? (
                    <Check size={16} className={clsx('shrink-0', item.checked ? 'text-accent' : 'invisible')} />
                  ) : (
                    item.icon && <span className="flex w-4 shrink-0 justify-center text-muted">{item.icon}</span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </span>
  );
}
