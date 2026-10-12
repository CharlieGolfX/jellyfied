import { act, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Runs a hook in a component, for tests. `result.current` is what the hook returned last;
 * `rerender` runs it again (with new props, if the hook takes any).
 */
export function renderHook<T, P = undefined>(
  hook: (props: P) => T,
  options: { props?: P; wrapper?: (children: ReactNode) => ReactNode } = {},
) {
  const result = { current: undefined as T };
  function Probe({ props }: { props: P }) {
    const value = hook(props);
    useEffect(() => {
      result.current = value;
    });
    return null;
  }
  const root = createRoot(document.createElement('div'));
  const render = (props: P) => {
    const probe = <Probe props={props} />;
    act(() => root.render(options.wrapper ? options.wrapper(probe) : probe));
  };
  render(options.props as P);
  return { result, rerender: (props?: P) => render((props ?? options.props) as P), unmount: () => act(() => root.unmount()) };
}

/** jsdom has media elements but no player behind them: playing, pausing and loading do nothing here. */
export function stubMediaElements() {
  const proto = HTMLMediaElement.prototype;
  proto.play = function play(this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    return Promise.resolve();
  };
  proto.pause = function pause(this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: true });
  };
  proto.load = () => {};
  // A <track> has no text track behind it either.
  if (!('track' in HTMLTrackElement.prototype)) {
    const tracks = new WeakMap<object, { mode: string; cues: null }>();
    Object.defineProperty(HTMLTrackElement.prototype, 'track', {
      configurable: true,
      get(this: HTMLTrackElement) {
        if (!tracks.has(this)) tracks.set(this, { mode: 'disabled', cues: null });
        return tracks.get(this);
      },
    });
  }
}
