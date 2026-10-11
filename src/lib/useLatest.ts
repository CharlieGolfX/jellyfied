import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * A ref that always holds the newest value, for callbacks and subscriptions that are set up once
 * but must see current props and state. The ref is updated after each render, before any effect
 * or event handler can run.
 */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
