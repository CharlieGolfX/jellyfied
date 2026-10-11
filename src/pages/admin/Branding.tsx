import type { BrandingOptionsDto } from '@/api/generated';
import { Button } from '@/components/ui/Button';
import { Field, Switch, TextArea } from '@/components/ui/Form';
import { PageSpinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { useDraft } from '@/lib/useDraft';
import { Card } from '@/pages/Settings';
import { useApi } from '@/auth/AuthProvider';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/Toast';
import { AdminPage } from './shared';

export default function BrandingPage() {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();
  // Read from one address and saved to another: the server has no "get" under the second.
  const query = useQuery({ queryKey: ['branding'], queryFn: () => api.get<BrandingOptionsDto>('/Branding/Configuration') });
  const save = useMutation({
    mutationFn: (value: BrandingOptionsDto) => api.post('/System/Configuration/Branding', value),
    onSuccess: () => {
      toast.success('Branding saved');
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
      title="Branding"
      description="What people see before they sign in."
      actions={
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(draft)}>
          Save changes
        </Button>
      }
    >
      <Card title="Login screen">
        <Field
          label="Login disclaimer"
          hint="Shown under the sign-in form, here and in other Jellyfin apps. Jellyplex shows it as plain text; the Jellyfin web interface also accepts HTML."
        >
          <TextArea rows={4} value={draft.LoginDisclaimer ?? ''} onChange={(e) => set('LoginDisclaimer', e.target.value)} />
        </Field>
      </Card>

      <Card title="Jellyfin web interface" description="These two only affect Jellyfin's own web interface, not Jellyplex.">
        <Field label="Custom CSS" hint="Jellyplex does not load it: its colours are set under Account settings.">
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
            label="Splash screen"
            description="Show an image made from the library while the web interface loads."
            checked={Boolean(draft.SplashscreenEnabled)}
            onChange={(v) => set('SplashscreenEnabled', v)}
          />
        </div>
      </Card>
    </AdminPage>
  );
}
