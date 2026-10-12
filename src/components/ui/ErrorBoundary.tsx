import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Rendered in place of the children after one of them threw while rendering. */
  fallback: (error: unknown, reset: () => void) => ReactNode;
  /** The error is cleared when this changes, e.g. the current path or the playing item. */
  resetKey?: unknown;
}

interface State {
  failed: boolean;
  error: unknown;
  resetKey: unknown;
}

/**
 * Keeps a rendering error in one part of the app from taking the whole page down: the part is
 * replaced by a fallback and everything around it keeps working.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { failed: true, error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (Object.is(props.resetKey, state.resetKey)) return null;
    return { failed: false, error: null, resetKey: props.resetKey };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Jellyfied: a part of the page crashed', error, info.componentStack);
  }

  reset = () => this.setState({ failed: false, error: null });

  render() {
    return this.state.failed ? this.props.fallback(this.state.error, this.reset) : this.props.children;
  }
}

/** A lazily loaded part of the app is gone from the server, which happens right after an update. */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|importing a module script failed|error loading dynamically/i.test(message);
}
