import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { BaseItemDto } from '@/api/types';

/** The items ticked in one grid or list, for actions on several items at once. */
export class SelectionStore {
  private items = new Map<string, BaseItemDto>();
  private list: BaseItemDto[] = [];
  private listeners = new Set<() => void>();

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

  toggle(item: BaseItemDto) {
    if (!this.items.delete(item.Id)) this.items.set(item.Id, item);
    this.changed();
  }

  add(items: BaseItemDto[]) {
    for (const item of items) this.items.set(item.Id, item);
    this.changed();
  }

  clear() {
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
  return useSyncExternalStore(store?.subscribe ?? noop, () => store?.has(id) ?? false, () => false);
}

export function useSelectionCount(): number {
  const store = useContext(SelectionContext);
  return useSyncExternalStore(store?.subscribe ?? noop, () => store?.count() ?? 0, () => 0);
}

const NONE: BaseItemDto[] = [];

export function useSelectedItems(): BaseItemDto[] {
  const store = useContext(SelectionContext);
  return useSyncExternalStore(store?.subscribe ?? noop, () => store?.selected() ?? NONE, () => NONE);
}
