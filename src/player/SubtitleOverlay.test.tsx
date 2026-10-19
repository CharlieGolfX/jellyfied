import { act, type RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubtitleOverlay } from './SubtitleOverlay';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A video as far as the overlay looks at one: a time, whether it plays, and its events. */
class FakeVideo extends EventTarget {
  currentTime = 0;
  paused = true;
  playbackRate = 1;
}

const cue = (startTime: number, endTime: number, text: string) => ({ startTime, endTime, text }) as unknown as VTTCue;

let host: HTMLDivElement;
let root: Root;
let video: FakeVideo;
let cues: VTTCue[];

function mount(delay = 0) {
  const videoRef = { current: video } as unknown as RefObject<HTMLVideoElement>;
  const trackRef = { current: { track: { cues } } } as unknown as RefObject<HTMLTrackElement>;
  act(() => root.render(<SubtitleOverlay videoRef={videoRef} trackRef={trackRef} delay={delay} raised={false} compact={false} />));
}

const shown = () => host.querySelector('[data-testid="subtitle-overlay"]')?.textContent ?? '';

function play() {
  video.paused = false;
  act(() => void video.dispatchEvent(new Event('play')));
}

/** Plays on for `seconds`, as the clock and the video both move. */
function advance(seconds: number) {
  video.currentTime += seconds;
  act(() => void vi.advanceTimersByTime(seconds * 1000));
}

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  video = new FakeVideo();
  cues = [cue(1, 2, 'one'), cue(3, 4, 'two')];
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe('SubtitleOverlay', () => {
  it('shows each cue while it lasts, looking again only when one starts or ends', () => {
    mount();
    expect(shown()).toBe('');
    play();
    advance(1.05);
    expect(shown()).toBe('one');
    advance(1);
    expect(shown()).toBe('');
    advance(1);
    expect(shown()).toBe('two');
    advance(1);
    expect(shown()).toBe('');
  });

  it('shifts the cues by the delay', () => {
    mount(0.5);
    play();
    advance(1.05);
    expect(shown()).toBe('');
    advance(0.5);
    expect(shown()).toBe('one');
  });

  it('follows a seek while paused, and a new track picked', () => {
    mount();
    video.currentTime = 3.5;
    act(() => void video.dispatchEvent(new Event('seeked')));
    expect(shown()).toBe('two');
    cues.splice(0, cues.length, cue(3, 5, 'other'));
    act(() => void video.dispatchEvent(new Event('load')));
    expect(shown()).toBe('other');
  });

  it('stops looking while paused', () => {
    mount();
    play();
    video.paused = true;
    act(() => void video.dispatchEvent(new Event('pause')));
    video.currentTime = 1.5;
    act(() => void vi.advanceTimersByTime(5000));
    expect(shown()).toBe('');
  });
});
