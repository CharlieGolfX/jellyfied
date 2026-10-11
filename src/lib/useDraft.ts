import { useState, type Dispatch, type SetStateAction } from 'react';

/**
 * An editable copy of data that was loaded from the server. The copy starts over whenever newer
 * data arrives (after saving, or a refetch), and is null until the first data is there.
 */
export function useDraft<T>(source: T | undefined): [T | null, Dispatch<SetStateAction<T | null>>] {
  const [from, setFrom] = useState<T | undefined>(undefined);
  const [draft, setDraft] = useState<T | null>(null);
  if (source !== undefined && source !== from) {
    setFrom(source);
    setDraft(source);
  }
  return [draft, setDraft];
}
