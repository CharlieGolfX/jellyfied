/**
 * Audio delay for the video player. The sound is routed through the Web Audio API with a delay
 * line in between, which can only hold sound back: a browser has no way to play the sound of a
 * video earlier than its picture.
 */

/** Longest delay, in seconds. */
export const MAX_AUDIO_DELAY = 3;
export const AUDIO_DELAY_STEP = 0.025;

interface Graph {
  context: AudioContext;
  delay: DelayNode;
  gain: GainNode;
  /** Output is silenced until the delay line has been flushed (after a pause or seek). */
  flushing: boolean;
  closeTimer?: number;
  detach: () => void;
}

// A media element can be connected to Web Audio only once, so the graph is kept per element.
const graphs = new WeakMap<HTMLMediaElement, Graph>();

/** The delay chosen last, kept for the next video (e.g. the next episode) until the page is closed. */
let lastDelay = 0;

export function getLastAudioDelay(): number {
  return lastDelay;
}

export function audioDelaySupported(): boolean {
  return typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
}

function create(video: HTMLMediaElement): Graph | null {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  const context = new Ctor();
  const source = context.createMediaElementSource(video);
  const delay = context.createDelay(MAX_AUDIO_DELAY);
  const gain = context.createGain();
  source.connect(delay).connect(gain).connect(context.destination);

  const graph: Graph = { context, delay, gain, flushing: false, detach: () => {} };
  // What is still in the delay line belongs to the old position: keep it quiet after a pause or
  // seek, and let the sound through again once the new audio has travelled through the line.
  const silence = () => {
    graph.flushing = true;
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setValueAtTime(0, context.currentTime);
  };
  const resume = () => {
    if (context.state === 'suspended') void context.resume().catch(() => {});
    if (!graph.flushing) return;
    graph.flushing = false;
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.setValueAtTime(1, context.currentTime + delay.delayTime.value);
  };
  video.addEventListener('pause', silence);
  video.addEventListener('seeking', silence);
  video.addEventListener('playing', resume);
  graph.detach = () => {
    video.removeEventListener('pause', silence);
    video.removeEventListener('seeking', silence);
    video.removeEventListener('playing', resume);
  };
  return graph;
}

/**
 * Sets the audio delay of a video element, in seconds. The audio graph is only built once a delay
 * is actually wanted, so normal playback is left untouched. Returns false when it isn't possible.
 */
export function setAudioDelay(video: HTMLMediaElement, seconds: number): boolean {
  lastDelay = seconds;
  let graph = graphs.get(video);
  if (!graph) {
    if (seconds === 0) return true;
    try {
      graph = create(video) ?? undefined;
    } catch (err) {
      console.warn('Audio delay is not available', err);
    }
    if (!graph) return false;
    graphs.set(video, graph);
  }
  window.clearTimeout(graph.closeTimer);
  graph.closeTimer = undefined;
  if (graph.context.state === 'suspended') void graph.context.resume().catch(() => {});
  graph.delay.delayTime.setValueAtTime(Math.min(MAX_AUDIO_DELAY, Math.max(0, seconds)), graph.context.currentTime);
  return true;
}

/** Whether the element's sound already runs through the delay line. */
export function hasAudioGraph(video: HTMLMediaElement): boolean {
  return graphs.has(video);
}

/** Releases the audio graph when the player goes away. */
export function releaseAudioDelay(video: HTMLMediaElement) {
  const graph = graphs.get(video);
  if (!graph) return;
  // Deferred: React's StrictMode tears effects down and sets them up again right away.
  graph.closeTimer = window.setTimeout(() => {
    graph.detach();
    void graph.context.close().catch(() => {});
    graphs.delete(video);
  }, 0);
}
