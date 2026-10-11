import clsx from 'clsx';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { isChunkLoadError } from './ErrorBoundary';
import { errorMessage } from './Toast';

/** Fallback shown by an error boundary in place of the page (or the whole app) that crashed. */
export function CrashState({ error, onRetry, fullPage }: { error: unknown; onRetry: () => void; fullPage?: boolean }) {
  const outdated = isChunkLoadError(error);
  return (
    <div
      role="alert"
      data-testid="crash-state"
      className={clsx(
        'flex flex-col items-center justify-center gap-3 px-4 text-center',
        fullPage ? 'min-h-full bg-base-950 py-10' : 'py-20',
      )}
    >
      <AlertTriangle className="text-danger" size={36} />
      <h2 className="text-lg font-semibold">{outdated ? 'Jellyplex was updated' : 'Something went wrong'}</h2>
      <p className="max-w-md text-sm text-muted">
        {outdated
          ? 'This page belongs to an older version. Reload to get the new one.'
          : 'This page ran into an error and could not be shown. The rest of Jellyplex still works.'}
      </p>
      {!outdated && <p className="max-w-md font-mono text-xs break-words text-faint">{errorMessage(error)}</p>}
      <div className="mt-1 flex gap-2">
        {!outdated && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )}
        <Button variant={outdated ? 'primary' : 'outline'} size="sm" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    </div>
  );
}
