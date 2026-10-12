import clsx from 'clsx';
import { useId } from 'react';
import { APP_NAME } from '@/config';

/** The six arms of the snowflake, as strokes. The same drawing is in public/favicon.svg. */
const SNOWFLAKE =
  'M256,256L256,36M196,62L256,122L316,62M212,146L256,190L300,146M256,256L446.5,146M394,107L372,189L454,211M329.3,162.9L313.2,223L373.3,239.1M256,256L446.5,366M454,301L372,323L394,405M373.3,272.9L313.2,289L329.3,349.1M256,256L256,476M316,450L256,390L196,450M300,366L256,322L212,366M256,256L65.5,366M118,405L140,323L58,301M182.7,349.1L198.8,289L138.7,272.9M256,256L65.5,146M58,211L140,189L118,107M138.7,239.1L198.8,223L182.7,162.9';

/** The Jellyfied snowflake on its own. */
export function AppIcon({ className, label = APP_NAME }: { className?: string; label?: string | null }) {
  const id = useId();
  return (
    <svg
      viewBox="0 0 512 512"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={id} x1="96" y1="64" x2="416" y2="448" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#a5e9ff" />
          <stop offset="1" stopColor="#00a4dc" />
        </linearGradient>
      </defs>
      <path d={SNOWFLAKE} fill="none" stroke={`url(#${id})`} strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The snowflake with the name next to it. Its size follows the text size. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-[0.3em] font-semibold tracking-tight text-fg', className ?? 'text-2xl')}>
      <AppIcon className="h-[1.2em] w-[1.2em] shrink-0" label={null} />
      {APP_NAME}
    </span>
  );
}
