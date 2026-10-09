import clsx from 'clsx';
import { AlertTriangle } from 'lucide-react';
import { useState, type ImgHTMLAttributes, type ReactNode } from 'react';
import { errorMessage } from './Toast';
import { Button } from './Button';

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center gap-3 py-16 text-center', className)}>
      <AlertTriangle className="text-danger" size={36} />
      <p className="max-w-md text-sm text-muted">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('flex flex-col items-center justify-center gap-3 py-20 text-center', className)}>
      {icon && <div className="text-faint">{icon}</div>}
      <h3 className="text-lg font-semibold">{title}</h3>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

/** Image that fades in on load and renders a fallback on error or when src is missing. */
export function Img({
  src,
  fallback,
  className,
  alt = '',
  ...rest
}: ImgHTMLAttributes<HTMLImageElement> & { fallback?: ReactNode }) {
  const [state, setState] = useState<{ src?: string; loaded: boolean; failed: boolean }>({
    src: src as string | undefined,
    loaded: false,
    failed: false,
  });
  // Reset when the source changes.
  if (state.src !== src) setState({ src: src as string | undefined, loaded: false, failed: false });

  if (!src || state.failed) return <>{fallback ?? null}</>;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      onLoad={() => setState((s) => ({ ...s, loaded: true }))}
      onError={() => setState((s) => ({ ...s, failed: true }))}
      className={clsx('transition-opacity duration-300', state.loaded ? 'opacity-100' : 'opacity-0', className)}
      {...rest}
    />
  );
}
