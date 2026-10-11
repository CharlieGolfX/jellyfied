import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { BaseItemDto } from '@/api/types';

/** The items ticked in one grid or list, for actions on several items at once. */
export class SelectionStore {
  private items = new Map<string, BaseItemDto>();
  private list: BaseItemDto[] = [];
  private listeners = new Set<() => void>();
  /** The items in the order they are shown, and the one last ticked: what a range is measured against. */
  private order: BaseItemDto[] = [];
  private anchor: string | null = null;

  private changed() {
    this.list = Array.from(this.items.values());
    this.listeners.forEach((l) => l());
  }

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  has = (id: string) => this.items.has(id);
  count = () => this.items.size;
  /** The same array until the selection changes. */
  selected = () => this.list;

  /** Tells the selection what is on screen, so a range can be selected. */
  setOrder(items: BaseItemDto[]) {
    this.order = items;
  }

  /** Ticks or unticks one item. With `range` (shift-click), ticks everything from the last ticked item to this one. */
  toggle(item: BaseItemDto, range = false) {
    const from = range && this.anchor ? this.order.findIndex((i) => i.Id === this.anchor) : -1;
    const to = from < 0 ? -1 : this.order.findIndex((i) => i.Id === item.Id);
    if (from >= 0 && to >= 0) {
      for (const i of this.order.slice(Math.min(from, to), Math.max(from, to) + 1)) this.items.set(i.Id, i);
    } else {
      if (!this.items.delete(item.Id)) this.items.set(item.Id, item);
      this.anchor = item.Id;
    }
    this.changed();
  }

  add(items: BaseItemDto[]) {
    for (const item of items) this.items.set(item.Id, item);
    this.changed();
  }

  clear() {
    this.anchor = null;
    if (this.items.size === 0) return;
    this.items.clear();
    this.changed();
  }
}

const SelectionContext = createContext<SelectionStore | null>(null);

/** Makes the cards and rows below it selectable. */
export function SelectionProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => new SelectionStore(), []);
  return <SelectionContext.Provider value={store}>{children}</SelectionContext.Provider>;
}

/** The selection this card or row belongs to, or null where items can't be selected. */
export function useSelection(): SelectionStore | null {
  return useContext(SelectionContext);
}

const noop = () => () => {};

export function useIsSelected(id: string): boolean {
  const store = useContext(SelectionContext);
  return useSyncExternalStore(
    store?.subscribe ?? noop,
    () => store?.has(id) ?? false,
    () => false,
  );
}

export function useSelectionCount(): number {
  const store = useContext(SelectionContext);
  return useSyncExternalStore(
    store?.subscribe ?? noop,
    () => store?.count() ?? 0,
    () => 0,
  );
}

const NONE: BaseItemDto[] = [];

export function useSelectedItems(): BaseItemDto[] {
  const store = useContext(SelectionContext);
  return useSyncExternalStore(
    store?.subscribe ?? noop,
    () => store?.selected() ?? NONE,
    () => NONE,
  );
}
