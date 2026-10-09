import clsx from 'clsx';

export function Spinner({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={clsx('animate-spin text-current', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function PageSpinner() {
  return (
    <div className="flex h-full min-h-64 w-full items-center justify-center text-accent">
      <Spinner size={40} />
    </div>
  );
}
