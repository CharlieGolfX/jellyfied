import clsx from 'clsx';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { t } from '@/i18n';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: unknown) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function errorMessage(err: unknown): string {
  if (!err) return t('ui.toast.somethingWentWrong');
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || t('ui.toast.somethingWentWrong');
  return t('ui.toast.somethingWentWrong');
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-4), { id, kind, message }]);
      window.setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3500);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (e) => push('error', errorMessage(e)),
      info: (m) => push('info', m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed right-4 bottom-4 z-[300] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={clsx(
                'animate-pop-in pointer-events-auto flex items-start gap-3 rounded-md bg-base-750 px-4 py-3 text-sm shadow-xl ring-1',
                toast.kind === 'error' && 'ring-danger/50',
                toast.kind === 'success' && 'ring-success/40',
                toast.kind === 'info' && 'ring-white/10',
              )}
            >
              {toast.kind === 'success' && <CheckCircle2 size={18} className="mt-px shrink-0 text-success" />}
              {toast.kind === 'error' && <AlertCircle size={18} className="mt-px shrink-0 text-danger" />}
              {toast.kind === 'info' && <Info size={18} className="mt-px shrink-0 text-info" />}
              <span className="min-w-0 flex-1 break-words">{toast.message}</span>
              <button onClick={() => dismiss(toast.id)} className="text-faint hover:text-fg" aria-label={t('ui.toast.dismiss')}>
                <X size={16} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
