import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary, isChunkLoadError } from './ErrorBoundary';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  // React and the boundary both log the caught error.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

function Page({ broken }: { broken: boolean }) {
  if (broken) throw new Error('boom');
  return <p>page content</p>;
}

const fallback = (error: unknown, reset: () => void) => <button onClick={reset}>failed: {(error as Error).message}</button>;

describe('ErrorBoundary', () => {
  it('shows its children while nothing is wrong', () => {
    act(() =>
      root.render(
        <ErrorBoundary fallback={fallback}>
          <Page broken={false} />
        </ErrorBoundary>,
      ),
    );
    expect(host.textContent).toBe('page content');
  });

  it('replaces only the part that crashed', () => {
    act(() =>
      root.render(
        <>
          <nav>navigation</nav>
          <ErrorBoundary fallback={fallback}>
            <Page broken />
          </ErrorBoundary>
        </>,
      ),
    );
    expect(host.textContent).toBe('navigationfailed: boom');
  });

  it('shows the children again when the reset key changes (e.g. going to another page)', () => {
    act(() =>
      root.render(
        <ErrorBoundary resetKey="/a" fallback={fallback}>
          <Page broken />
        </ErrorBoundary>,
      ),
    );
    expect(host.textContent).toBe('failed: boom');
    act(() =>
      root.render(
        <ErrorBoundary resetKey="/b" fallback={fallback}>
          <Page broken={false} />
        </ErrorBoundary>,
      ),
    );
    expect(host.textContent).toBe('page content');
  });

  it('stays on the fallback while the reset key is the same', () => {
    act(() =>
      root.render(
        <ErrorBoundary resetKey="/a" fallback={fallback}>
          <Page broken />
        </ErrorBoundary>,
      ),
    );
    act(() =>
      root.render(
        <ErrorBoundary resetKey="/a" fallback={fallback}>
          <Page broken={false} />
        </ErrorBoundary>,
      ),
    );
    expect(host.textContent).toBe('failed: boom');
  });

  it('retries when the fallback asks for it', () => {
    let broken = true;
    const Flaky = () => <Page broken={broken} />;
    act(() =>
      root.render(
        <ErrorBoundary fallback={fallback}>
          <Flaky />
        </ErrorBoundary>,
      ),
    );
    expect(host.textContent).toBe('failed: boom');
    broken = false;
    act(() => host.querySelector('button')!.click());
    expect(host.textContent).toBe('page content');
  });
});

describe('isChunkLoadError', () => {
  it('recognises a lazily loaded page that is gone after an update', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: http://x/assets/Settings-abc.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('boom'))).toBe(false);
  });
});
