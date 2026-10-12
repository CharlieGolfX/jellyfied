import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JellyfinApi } from '@/api/client';
import type { BaseItemDto, MediaSegment } from '@/api/types';
import { renderHook } from '@/test/renderHook';
import { TICKS_PER_SECOND } from '@/lib/format';
import {
  useActiveSegment,
  useAutoHide,
  useFullscreen,
  useOsd,
  usePictureInPicture,
  usePlayerSizes,
  useTrickplayPreview,
} from './usePlayerChrome';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const seconds = (n: number) => n * TICKS_PER_SECOND;

describe('useOsd', () => {
  it('shows a note for a moment, and the latest one when they follow each other', () => {
    const { result } = renderHook(() => useOsd());
    act(() => result.current.flash('Speed 1.5×'));
    expect(result.current.osd).toBe('Speed 1.5×');
    act(() => vi.advanceTimersByTime(1000));
    act(() => result.current.flash('Speed 2×'));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.osd).toBe('Speed 2×');
    act(() => vi.advanceTimersByTime(600));
    expect(result.current.osd).toBeNull();
  });
});

describe('useAutoHide', () => {
  it('hides the controls after three quiet seconds, and a poke starts the count again', () => {
    const { result } = renderHook(() => useAutoHide());
    expect(result.current.visible).toBe(true);
    act(() => vi.advanceTimersByTime(2500));
    act(() => result.current.poke());
    act(() => vi.advanceTimersByTime(2500));
    expect(result.current.visible).toBe(true);
    act(() => vi.advanceTimersByTime(600));
    expect(result.current.visible).toBe(false);
    act(() => result.current.poke());
    expect(result.current.visible).toBe(true);
  });

  it('can be hidden right away', () => {
    const { result } = renderHook(() => useAutoHide());
    act(() => result.current.hide());
    expect(result.current.visible).toBe(false);
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.visible).toBe(false);
  });
});

describe('useActiveSegment', () => {
  const segments = [
    { Id: 'a', ItemId: 'x', Type: 'Intro', StartTicks: seconds(10), EndTicks: seconds(40) },
    { Id: 'b', ItemId: 'x', Type: 'Unknown', StartTicks: seconds(50), EndTicks: seconds(60) },
  ] as unknown as MediaSegment[];

  it('finds the segment the video is in, up to a second before it ends', () => {
    const { result, rerender } = renderHook((time: number) => useActiveSegment(segments, time), { props: 5 });
    expect(result.current.segment).toBeUndefined();
    rerender(10);
    expect(result.current.segment?.Type).toBe('Intro');
    rerender(39.5);
    expect(result.current.segment).toBeUndefined();
  });

  it('ignores kinds of segment there is no button for', () => {
    const { result } = renderHook(() => useActiveSegment(segments, 55));
    expect(result.current.segment).toBeUndefined();
  });

  it('is fresh for the first few seconds of a segment', () => {
    const { result, rerender } = renderHook((time: number) => useActiveSegment(segments, time), { props: 12 });
    expect(result.current.fresh).toBe(true);
    act(() => vi.advanceTimersByTime(5100));
    rerender(17);
    expect(result.current.segment?.Type).toBe('Intro');
    expect(result.current.fresh).toBe(false);
  });
});

describe('usePictureInPicture', () => {
  it("follows the browser's picture-in-picture events", () => {
    const video = document.createElement('video');
    const { result, unmount } = renderHook(() => usePictureInPicture({ current: video }));
    expect(result.current.inPip).toBe(false);
    act(() => void video.dispatchEvent(new Event('enterpictureinpicture')));
    expect(result.current.inPip).toBe(true);
    act(() => void video.dispatchEvent(new Event('leavepictureinpicture')));
    expect(result.current.inPip).toBe(false);
    // Without picture-in-picture in the browser, the toggle does nothing.
    expect(() => result.current.togglePip()).not.toThrow();
    unmount();
  });
});

describe('useFullscreen', () => {
  it('asks the player to go full screen, and leaves it again', () => {
    const container = document.createElement('div');
    const request = vi.fn(() => Promise.resolve());
    container.requestFullscreen = request;
    const exit = vi.fn(() => Promise.resolve());
    document.exitFullscreen = exit;
    let element: Element | null = null;
    // jsdom has no full screen, so the property is put there for the test.
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element });

    const { result } = renderHook(() => useFullscreen({ current: container }, { current: null }));
    act(() => result.current.toggleFullscreen());
    expect(request).toHaveBeenCalled();
    element = container;
    act(() => void document.dispatchEvent(new Event('fullscreenchange')));
    expect(result.current.isFullscreen).toBe(true);

    act(() => result.current.toggleFullscreen());
    expect(exit).toHaveBeenCalled();
    element = null;
    act(() => void document.dispatchEvent(new Event('fullscreenchange')));
    expect(result.current.isFullscreen).toBe(false);
  });

  it('puts the video alone in full screen where the page cannot be (iPhone)', () => {
    const video = Object.assign(document.createElement('video'), { webkitEnterFullscreen: vi.fn() });
    const container = document.createElement('div');
    Object.defineProperty(container, 'requestFullscreen', { value: undefined });
    const { result } = renderHook(() => useFullscreen({ current: container }, { current: video }));
    act(() => result.current.toggleFullscreen());
    expect(video.webkitEnterFullscreen).toHaveBeenCalled();
  });
});

describe('usePlayerSizes', () => {
  it('reports the size of the player and of the picture', () => {
    let resized: () => void = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const container = document.createElement('div');
    Object.defineProperties(container, { clientWidth: { value: 1280 }, clientHeight: { value: 720 } });
    const video = document.createElement('video');
    Object.defineProperties(video, { videoWidth: { value: 1920 }, videoHeight: { value: 800 } });
    const { result } = renderHook(() => usePlayerSizes({ current: container }, { current: video }));
    act(() => resized());
    act(() => void video.dispatchEvent(new Event('loadedmetadata')));
    expect(result.current).toEqual({ box: { width: 1280, height: 720 }, video: { width: 1920, height: 800 } });
    vi.unstubAllGlobals();
  });
});

describe('useTrickplayPreview', () => {
  const api = { url: (path: string, query: Record<string, string>) => `${path}?${new URLSearchParams(query)}` } as unknown as JellyfinApi;
  const item = {
    Id: 'item-1',
    Trickplay: { 'source-1': { 320: { Width: 320, Height: 180, TileWidth: 10, TileHeight: 10, ThumbnailCount: 250, Interval: 10_000 } } },
  } as unknown as BaseItemDto;

  it('is not there for a video without thumbnails', () => {
    const { result } = renderHook(() => useTrickplayPreview(api, { Id: 'item-1' } as BaseItemDto, 'item-1', 'source-1'));
    expect(result.current).toBeUndefined();
  });

  it('cuts the thumbnail for a moment out of the right sheet', () => {
    const { result } = renderHook(() => useTrickplayPreview(api, item, 'item-1', 'source-1'));
    // 20 minutes and 30 seconds in is thumbnail 123: sheet 1, row 2, column 3.
    const element = result.current!(1230) as { props: { style: Record<string, string | number> } };
    expect(element.props.style.backgroundImage).toContain('/Videos/item-1/Trickplay/320/1.jpg?mediaSourceId=source-1');
    expect(element.props.style.width).toBe(240);
    expect(element.props.style.height).toBe(135);
    expect(element.props.style.backgroundPosition).toBe('-720px -270px');
  });

  it('stays on the last thumbnail past the end', () => {
    const { result } = renderHook(() => useTrickplayPreview(api, item, 'item-1', 'source-1'));
    const element = result.current!(99_999) as { props: { style: Record<string, string> } };
    expect(element.props.style.backgroundImage).toContain('/320/2.jpg');
  });
});
