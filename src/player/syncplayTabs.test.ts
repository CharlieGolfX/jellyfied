import { beforeEach, describe, expect, it } from 'vitest';
import { playingTab, setPlayingTab, TAB_CLAIM_STALE } from './syncplayTabs';

describe('the tab that plays along', () => {
  beforeEach(() => localStorage.clear());

  it('is whichever tab claimed it last', () => {
    setPlayingTab('a', 1000);
    expect(playingTab(1000)).toBe('a');
    setPlayingTab('b', 2000);
    expect(playingTab(2000)).toBe('b');
    setPlayingTab(null);
    expect(playingTab()).toBeNull();
  });

  it('is taken as gone once its claim hasn’t been renewed for a while, as when a phone drops the tab', () => {
    setPlayingTab('a', 1000);
    expect(playingTab(1000 + TAB_CLAIM_STALE - 1)).toBe('a');
    expect(playingTab(1000 + TAB_CLAIM_STALE)).toBeNull();
  });

  it('ignores a claim in the form of an older version', () => {
    localStorage.setItem('jellyfied.syncPlayTab', 'abc123');
    expect(playingTab()).toBeNull();
  });
});
