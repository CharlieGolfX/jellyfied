import type { BrandingOptionsDto } from '@/api/generated';
import { Button } from '@/components/ui/Button';
import { Field, Switch, TextArea } from '@/components/ui/Form';
import { PageSpinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { useDraft } from '@/lib/useDraft';
import { Card } from '@/components/ui/Card';
import { useApi } from '@/auth/AuthProvider';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/Toast';
import { AdminPage } from './shared';
import { t } from '@/i18n';

export default function BrandingPage() {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();
  // Read from one address and saved to another: the server has no "get" under the second.
  const query = useQuery({ queryKey: ['branding'], queryFn: () => api.get<BrandingOptionsDto>('/Branding/Configuration') });
  const save = useMutation({
    mutationFn: (value: BrandingOptionsDto) => api.post('/System/Configuration/Branding', value),
    onSuccess: () => {
      toast.success(t('admin.branding.brandingSaved'));
      void qc.invalidateQueries({ queryKey: ['branding'] });
    },
    onError: (e) => toast.error(e),
  });
  const [draft, setDraft] = useDraft(query.data);

  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (!draft) return <PageSpinner />;
  const set = <K extends keyof BrandingOptionsDto>(k: K, v: BrandingOptionsDto[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <AdminPage
      title={t('admin.branding.branding')}
      description={t('admin.branding.whatPeopleSeeBeforeThey')}
      actions={
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(draft)}>
          {t('common.saveChanges')}
        </Button>
      }
    >
      <Card title={t('admin.branding.loginScreen')}>
        <Field label={t('admin.branding.loginDisclaimer')} hint={t('admin.branding.disclaimerHint')}>
          <TextArea rows={4} value={draft.LoginDisclaimer ?? ''} onChange={(e) => set('LoginDisclaimer', e.target.value)} />
        </Field>
      </Card>

      <Card title={t('admin.branding.jellyfinWebInterface')} description={t('admin.branding.webOnlyHint')}>
        <Field label={t('admin.branding.customCss')} hint={t('admin.branding.customCssHint')}>
          <TextArea
            rows={8}
            spellCheck={false}
            className="font-mono text-xs"
            value={draft.CustomCss ?? ''}
            onChange={(e) => set('CustomCss', e.target.value)}
          />
        </Field>
        <div className="mt-3">
          <Switch
            label={t('admin.branding.splashScreen')}
            description={t('admin.branding.splashscreenHint')}
            checked={Boolean(draft.SplashscreenEnabled)}
            onChange={(v) => set('SplashscreenEnabled', v)}
          />
        </div>
      </Card>
    </AdminPage>
  );
}
