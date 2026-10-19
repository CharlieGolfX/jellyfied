import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useApi, useSession } from '@/auth/AuthProvider';
import { t } from '@/i18n';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';

export function PasswordCard({ hasPassword }: { hasPassword: boolean }) {
  const api = useApi();
  const { userId } = useSession();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const mutation = useMutation({
    mutationFn: () => api.post('/Users/Password', { CurrentPw: current, NewPw: next }, { userId }),
    onSuccess: () => {
      toast.success(t('settings.passwordChanged'));
      setCurrent('');
      setNext('');
      setConfirm('');
    },
    onError: (e) => toast.error(e),
  });
  const mismatch = confirm.length > 0 && next !== confirm;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mismatch) return;
    mutation.mutate();
  };

  return (
    <Card title={t('common.password')}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
        {hasPassword && (
          <Field label={t('settings.currentPassword')}>
            <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
        )}
        <Field label={t('settings.newPassword')}>
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field
          label={t('settings.confirmNewPassword')}
          hint={mismatch ? <span className="text-danger">{t('settings.passwordMismatch')}</span> : undefined}
        >
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <div className="sm:col-span-3">
          <Button type="submit" variant="primary" loading={mutation.isPending} disabled={mismatch || (!next && !hasPassword)}>
            {t('settings.updatePassword')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
