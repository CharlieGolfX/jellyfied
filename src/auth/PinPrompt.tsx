import { Lock } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { checkPin, hasPin } from './accountPin';
import { useAuth, type StoredSession } from './AuthProvider';
import { t } from '@/i18n';

/** A PIN field: digits only, hidden as they are typed. */
export function PinInput({ value, onChange, autoFocus }: { value: string; onChange: (pin: string) => void; autoFocus?: boolean }) {
  return (
    <Input
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={12}
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      className="tracking-[0.3em]"
    />
  );
}

function PinPrompt({
  account,
  onClose,
  onUnlocked,
}: {
  account: StoredSession;
  onClose: () => void;
  onUnlocked: (accessToken?: string) => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (checking) return;
    setChecking(true);
    const result = await checkPin(account, pin);
    if (result.ok) return onUnlocked(result.accessToken);
    setChecking(false);
    setPin('');
    setError(
      result.lockedFor
        ? t('auth.pin.locked', { seconds: Math.ceil(result.lockedFor / 1000) })
        : t('auth.pin.wrong', { count: result.triesLeft ?? 0 }),
    );
  };

  return (
    <Modal open onClose={onClose} title={t('auth.pinPrompt.switchTo', { userName: account.userName })} size="sm">
      <form onSubmit={(e) => void submit(e)} className="space-y-4" data-testid="pin-prompt">
        <p className="flex items-start gap-2 text-sm text-muted">
          <Lock size={16} className="mt-0.5 shrink-0" />
          {t('auth.pinPrompt.protectedByPin')}
        </p>
        <Field label={t('auth.pinPrompt.pin')} hint={error ? <span className="text-danger">{error}</span> : undefined}>
          <PinInput value={pin} onChange={setPin} autoFocus />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={pin.length < 4 || checking}>
            {t('auth.pinPrompt.switch')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Switching to another signed-in account, asking for its PIN first when it has one. */
export function useGuardedSwitch(): { switchTo: (account: StoredSession) => void; dialog: ReactNode } {
  const { switchAccount } = useAuth();
  const [asking, setAsking] = useState<StoredSession | null>(null);
  return {
    switchTo: (account) => (hasPin(account) ? setAsking(account) : switchAccount(account)),
    dialog: asking && (
      <PinPrompt account={asking} onClose={() => setAsking(null)} onUnlocked={(accessToken) => switchAccount(asking, accessToken)} />
    ),
  };
}
