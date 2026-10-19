import { useState, type FormEvent } from 'react';
import { checkPin, hasPin, validPin } from '@/auth/accountPin';
import { useAuth, useSession } from '@/auth/AuthProvider';
import { PinInput } from '@/auth/PinPrompt';
import { t } from '@/i18n';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';

/** Sets, changes or removes the PIN that is asked for before switching to this account on this device. */
export function AccountPinCard() {
  const session = useSession();
  const { protectAccount } = useAuth();
  const toast = useToast();
  const [protectedNow, setProtectedNow] = useState(() => hasPin(session));
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const mismatch = confirm.length > 0 && next !== confirm;

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setProtectedNow(hasPin(session));
  };
  /** Changing or removing a PIN takes the PIN, or anyone at the keyboard could do it. */
  const currentIsRight = async () => {
    const result = await checkPin(session, current);
    if (result.ok) return true;
    toast.error(result.lockedFor ? t('auth.pin.locked', { seconds: Math.ceil(result.lockedFor / 1000) }) : t('settings.pinWrong'));
    setCurrent('');
    return false;
  };
  // Working out a key from a PIN takes a moment: one thing at a time.
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || mismatch || !validPin(next)) return;
    setBusy(true);
    try {
      if (!(await currentIsRight())) return;
      await protectAccount(next);
      toast.success(protectedNow ? t('settings.pinChanged') : t('settings.pinSet'));
      reset();
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (!(await currentIsRight())) return;
      await protectAccount(null);
      toast.success(t('settings.pinRemoved'));
      reset();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t('settings.accountPin')} description={t('settings.pinHint')}>
      <form onSubmit={(e) => void submit(e)} className="grid gap-4 sm:grid-cols-3" data-testid="account-pin">
        {protectedNow && (
          <Field label={t('settings.currentPin')}>
            <PinInput value={current} onChange={setCurrent} />
          </Field>
        )}
        <Field label={protectedNow ? t('settings.newPin') : t('settings.pin')} hint={t('settings.pinLength')}>
          <PinInput value={next} onChange={setNext} />
        </Field>
        <Field
          label={t('settings.repeatThePin')}
          hint={mismatch ? <span className="text-danger">{t('settings.pinMismatch')}</span> : undefined}
        >
          <PinInput value={confirm} onChange={setConfirm} />
        </Field>
        <div className="flex flex-wrap gap-2 sm:col-span-3">
          <Button
            type="submit"
            variant="primary"
            disabled={busy || mismatch || !validPin(next) || next !== confirm || (protectedNow && !current)}
          >
            {protectedNow ? t('settings.changePin') : t('settings.setPin')}
          </Button>
          {protectedNow && (
            <Button variant="outline" disabled={busy || !current} onClick={() => void remove()}>
              {t('settings.removePin')}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
