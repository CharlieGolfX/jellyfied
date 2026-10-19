import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { QuickConnectResult } from '@/api/types';
import { useApi, useSession } from '@/auth/AuthProvider';
import { t } from '@/i18n';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';

export function QuickConnectCard() {
  const api = useApi();
  const { userId } = useSession();
  const toast = useToast();
  const [code, setCode] = useState('');
  const enabled = useQuery({ queryKey: ['qc-enabled'], queryFn: () => api.get<boolean>('/QuickConnect/Enabled') });
  const mutation = useMutation({
    mutationFn: () => api.post<boolean | QuickConnectResult>('/QuickConnect/Authorize', undefined, { code: code.trim(), userId }),
    onSuccess: () => {
      toast.success(t('settings.deviceAuthorized'));
      setCode('');
    },
    onError: (e) => toast.error(e),
  });
  if (enabled.data !== true) return null;
  return (
    <Card title={t('settings.quickConnect')} description={t('settings.signInOnAnotherDevice')}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) mutation.mutate();
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <Field label={t('settings.code')} className="w-48">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            placeholder="123456"
            className="font-mono tracking-widest"
          />
        </Field>
        <Button type="submit" variant="primary" icon={<KeyRound size={16} />} loading={mutation.isPending} disabled={!code.trim()}>
          {t('settings.authorize')}
        </Button>
      </form>
    </Card>
  );
}
