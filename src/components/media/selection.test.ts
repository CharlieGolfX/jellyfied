import { describe, expect, it, vi } from 'vitest';
import type { BaseItemDto } from '@/api/types';
import { countSettled } from './BulkBar';
import { SelectionStore } from './selection';

const item = (id: string) => ({ Id: id, Type: 'Movie' }) as BaseItemDto;

describe('SelectionStore', () => {
  it('ticks and unticks an item', () => {
    const store = new SelectionStore();
    store.toggle(item('a'));
    expect(store.has('a')).toBe(true);
    expect(store.count()).toBe(1);
    store.toggle(item('a'));
    expect(store.has('a')).toBe(false);
  });

  it('adds many items without doubling the ones already ticked', () => {
    const store = new SelectionStore();
    store.toggle(item('a'));
    store.add([item('a'), item('b'), item('c')]);
    expect(store.selected().map((i) => i.Id)).toEqual(['a', 'b', 'c']);
  });

  it('hands out the same list until the selection changes', () => {
    const store = new SelectionStore();
    store.toggle(item('a'));
    const before = store.selected();
    expect(store.selected()).toBe(before);
    store.toggle(item('b'));
    expect(store.selected()).not.toBe(before);
  });

  it('tells its listeners about changes, but not about clearing nothing', () => {
    const store = new SelectionStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.clear();
    expect(listener).not.toHaveBeenCalled();
    store.toggle(item('a'));
    store.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    store.toggle(item('a'));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('SelectionStore ranges', () => {
  const items = ['a', 'b', 'c', 'd', 'e'].map((Id) => ({ Id, Name: Id }) as BaseItemDto);
  const ids = (store: SelectionStore) =>
    store
      .selected()
      .map((i) => i.Id)
      .sort();

  it('selects everything between the last ticked item and a shift-clicked one', () => {
    const store = new SelectionStore();
    store.setOrder(items);
    store.toggle(items[1]);
    store.toggle(items[3], true);
    expect(ids(store)).toEqual(['b', 'c', 'd']);
  });

  it('works upwards, and keeps measuring from the same item', () => {
    const store = new SelectionStore();
    store.setOrder(items);
    store.toggle(items[3]);
    store.toggle(items[1], true);
    expect(ids(store)).toEqual(['b', 'c', 'd']);
    store.toggle(items[4], true);
    expect(ids(store)).toEqual(['b', 'c', 'd', 'e']);
  });

  it('is an ordinary tick without an item to measure from', () => {
    const store = new SelectionStore();
    store.setOrder(items);
    store.toggle(items[2], true);
    expect(ids(store)).toEqual(['c']);
    store.clear();
    store.toggle(items[4], true);
    expect(ids(store)).toEqual(['e']);
  });
});

describe('countSettled', () => {
  it('counts what went through and what did not', () => {
    expect(
      countSettled([
        { status: 'fulfilled', value: 1 },
        { status: 'rejected', reason: new Error('no') },
        { status: 'fulfilled', value: 2 },
      ]),
    ).toEqual({ done: 2, failed: 1 });
  });
});
