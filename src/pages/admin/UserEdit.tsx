import clsx from 'clsx';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BaseItemDto, ItemsResult, UserDto, UserPolicy } from '@/api/types';
import { useApi, useSession } from '@/auth/AuthProvider';
import { Avatar } from '@/components/layout/UserMenu';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Switch } from '@/components/ui/Form';
import { ConfirmDialog } from '@/components/ui/Modal';
import { PageSpinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { Card } from '@/pages/Settings';
import { ParentalControls } from './ParentalControls';
import { AdminPage } from './shared';
import { t, tRich } from '@/i18n';

type Tab = 'profile' | 'access' | 'parental' | 'password';

export default function UserEditPage() {
  const { userId = '' } = useParams();
  const api = useApi();
  const session = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('profile');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const user = useQuery({ queryKey: ['admin', 'user', userId], queryFn: () => api.get<UserDto>(`/Users/${userId}`) });
  const folders = useQuery({
    queryKey: ['admin', 'mediafolders'],
    queryFn: () => api.get<ItemsResult<BaseItemDto>>('/Library/MediaFolders', { isHidden: false }),
  });

  const [name, setName] = useState('');
  const [policy, setPolicy] = useState<UserPolicy | null>(null);
  // The form starts over from the saved user, each time that is loaded.
  const [loaded, setLoaded] = useState<typeof user.data>(undefined);
  if (user.data && user.data !== loaded) {
    setLoaded(user.data);
    setName(user.data.Name);
    setPolicy(user.data.Policy);
  }

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'user', userId] });
    void qc.invalidateQueries({ queryKey: ['me'] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!user.data || !policy) return;
      if (name.trim() && name.trim() !== user.data.Name) {
        await api.post('/Users', { ...user.data, Name: name.trim() }, { userId });
      }
      await api.post(`/Users/${userId}/Policy`, policy);
    },
    onSuccess: () => {
      toast.success(t('admin.userEdit.userSaved'));
      invalidate();
    },
    onError: (e) => toast.error(e),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/Users/${userId}`),
    onSuccess: () => {
      toast.success(t('admin.userEdit.userDeleted'));
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      navigate('/admin/users');
    },
    onError: (e) => toast.error(e),
  });

  if (user.error) return <ErrorState error={user.error} onRetry={() => user.refetch()} />;
  if (!user.data || !policy) return <PageSpinner />;

  const isSelf = userId === session.userId;
  const p = <K extends keyof UserPolicy>(k: K, v: UserPolicy[K]) => setPolicy((cur) => (cur ? { ...cur, [k]: v } : cur));

  const toggleFolder = (id: string, on: boolean) => {
    const set = new Set(policy.EnabledFolders ?? []);
    if (on) set.add(id);
    else set.delete(id);
    p('EnabledFolders', [...set]);
  };
  const toggleDeletionFolder = (id: string, on: boolean) => {
    const set = new Set(policy.EnableContentDeletionFromFolders ?? []);
    if (on) set.add(id);
    else set.delete(id);
    p('EnableContentDeletionFromFolders', [...set]);
  };

  return (
    <AdminPage
      title={user.data.Name}
      description={
        <Link to="/admin/users" className="inline-flex items-center gap-1 text-accent hover:underline">
          <ArrowLeft size={14} /> {t('admin.userEdit.allUsers')}
        </Link>
      }
      actions={
        <>
          {!isSelf && (
            <Button variant="outline" icon={<Trash2 size={16} />} onClick={() => setConfirmDelete(true)}>
              {t('common.delete')}
            </Button>
          )}
          {tab !== 'password' && (
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
              {t('common.saveChanges')}
            </Button>
          )}
        </>
      }
    >
      <div className="flex items-center gap-4">
        <Avatar userId={user.data.Id} tag={user.data.PrimaryImageTag} name={user.data.Name} size={56} />
        <div className="flex gap-1 rounded-lg bg-base-800/70 p-1 ring-1 ring-white/5">
          {(['profile', 'access', 'parental', 'password'] as Tab[]).map((option) => (
            <button
              key={option}
              onClick={() => setTab(option)}
              className={clsx(
                'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                tab === option ? 'bg-white/10 text-fg' : 'text-muted hover:text-fg',
              )}
            >
              {t(`admin.userEdit.tab.${option}`)}
            </button>
          ))}
        </div>
      </div>

      {tab === 'profile' && (
        <>
          <Card title={t('admin.userEdit.profile')}>
            <Field label={t('admin.userEdit.username')} className="max-w-sm">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div className="mt-3 divide-y divide-white/5">
              <Switch
                label={t('admin.userEdit.administrator')}
                description={t('admin.userEdit.fullAccessToTheServer')}
                checked={policy.IsAdministrator}
                disabled={isSelf}
                onChange={(v) => p('IsAdministrator', v)}
              />
              <Switch
                label={t('admin.userEdit.disableThisUser')}
                description={t('admin.userEdit.disabledHint')}
                checked={policy.IsDisabled}
                disabled={isSelf}
                onChange={(v) => p('IsDisabled', v)}
              />
              <Switch label={t('admin.userEdit.hideFromLoginScreen')} checked={policy.IsHidden} onChange={(v) => p('IsHidden', v)} />
              <Switch
                label={t('admin.userEdit.allowRemoteConnections')}
                checked={policy.EnableRemoteAccess}
                onChange={(v) => p('EnableRemoteAccess', v)}
              />
            </div>
          </Card>

          <Card title={t('admin.userEdit.playback')}>
            <div className="divide-y divide-white/5">
              <Switch
                label={t('admin.userEdit.allowMediaPlayback')}
                checked={policy.EnableMediaPlayback}
                onChange={(v) => p('EnableMediaPlayback', v)}
              />
              <Switch
                label={t('admin.userEdit.allowAudioTranscoding')}
                checked={policy.EnableAudioPlaybackTranscoding}
                onChange={(v) => p('EnableAudioPlaybackTranscoding', v)}
              />
              <Switch
                label={t('admin.userEdit.allowVideoTranscoding')}
                checked={policy.EnableVideoPlaybackTranscoding}
                onChange={(v) => p('EnableVideoPlaybackTranscoding', v)}
              />
              <Switch
                label={t('admin.userEdit.allowRemuxing')}
                checked={policy.EnablePlaybackRemuxing}
                onChange={(v) => p('EnablePlaybackRemuxing', v)}
              />
              <Switch
                label={t('admin.userEdit.forceRemoteTranscoding')}
                checked={policy.ForceRemoteSourceTranscoding}
                onChange={(v) => p('ForceRemoteSourceTranscoding', v)}
              />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label={t('admin.userEdit.remoteBitrateLimitMbps')} hint={t('admin.userEdit.zeroNoLimit')}>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={policy.RemoteClientBitrateLimit ? policy.RemoteClientBitrateLimit / 1_000_000 : 0}
                  onChange={(e) => p('RemoteClientBitrateLimit', Math.round(Number(e.target.value || 0) * 1_000_000))}
                />
              </Field>
              <Field label={t('admin.userEdit.maxActiveSessions')} hint={t('admin.userEdit.zeroUnlimited')}>
                <Input
                  type="number"
                  min={0}
                  value={policy.MaxActiveSessions ?? 0}
                  onChange={(e) => p('MaxActiveSessions', Number(e.target.value || 0))}
                />
              </Field>
              <Field label={t('admin.userEdit.loginAttempts')} hint={t('admin.userEdit.lockoutHint')}>
                <Input
                  type="number"
                  min={-1}
                  value={policy.LoginAttemptsBeforeLockout ?? -1}
                  onChange={(e) => p('LoginAttemptsBeforeLockout', Number(e.target.value || 0))}
                />
              </Field>
            </div>
          </Card>

          <Card title={t('admin.userEdit.permissions')}>
            <div className="divide-y divide-white/5">
              <Switch
                label={t('admin.userEdit.allowMediaDownloads')}
                checked={policy.EnableContentDownloading}
                onChange={(v) => p('EnableContentDownloading', v)}
              />
              <Switch
                label={t('admin.userEdit.deleteFromAll')}
                checked={policy.EnableContentDeletion}
                onChange={(v) => p('EnableContentDeletion', v)}
              />
              {'EnableCollectionManagement' in policy && (
                <Switch
                  label={t('admin.userEdit.allowManagingCollections')}
                  checked={Boolean(policy.EnableCollectionManagement)}
                  onChange={(v) => p('EnableCollectionManagement', v)}
                />
              )}
              {'EnableSubtitleManagement' in policy && (
                <Switch
                  label={t('admin.userEdit.allowManagingSubtitles')}
                  checked={Boolean(policy.EnableSubtitleManagement)}
                  onChange={(v) => p('EnableSubtitleManagement', v)}
                />
              )}
              <Switch
                label={t('admin.userEdit.controlOtherUsers')}
                checked={policy.EnableRemoteControlOfOtherUsers}
                onChange={(v) => p('EnableRemoteControlOfOtherUsers', v)}
              />
              <Switch
                label={t('admin.userEdit.controlSharedDevices')}
                checked={policy.EnableSharedDeviceControl}
                onChange={(v) => p('EnableSharedDeviceControl', v)}
              />
              <Switch
                label={t('admin.userEdit.allowLiveTvAccess')}
                checked={policy.EnableLiveTvAccess}
                onChange={(v) => p('EnableLiveTvAccess', v)}
              />
              <Switch
                label={t('admin.userEdit.manageRecordings')}
                checked={policy.EnableLiveTvManagement}
                onChange={(v) => p('EnableLiveTvManagement', v)}
              />
            </div>
            {!policy.EnableContentDeletion && (folders.data?.Items.length ?? 0) > 0 && (
              <div className="mt-4">
                <div className="mb-1 text-sm font-medium">{t('admin.userEdit.deleteFromLibraries')}</div>
                {folders.data!.Items.map((f) => (
                  <Checkbox
                    key={f.Id}
                    label={f.Name}
                    checked={(policy.EnableContentDeletionFromFolders ?? []).includes(f.Id)}
                    onChange={(v) => toggleDeletionFolder(f.Id, v)}
                  />
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {tab === 'access' && (
        <Card title={t('admin.userEdit.libraryAccess')}>
          <Switch
            label={t('admin.userEdit.accessToAllLibraries')}
            checked={policy.EnableAllFolders}
            onChange={(v) => p('EnableAllFolders', v)}
          />
          {!policy.EnableAllFolders && (
            <div className="mt-2 rounded-md bg-black/20 p-3">
              {folders.isLoading && <p className="text-sm text-muted">{t('admin.userEdit.loadingLibraries')}</p>}
              {folders.data?.Items.map((f) => (
                <Checkbox
                  key={f.Id}
                  label={f.Name}
                  checked={(policy.EnabledFolders ?? []).includes(f.Id)}
                  onChange={(v) => toggleFolder(f.Id, v)}
                />
              ))}
            </div>
          )}
          <div className="mt-3 border-t border-white/5 pt-1">
            <Switch
              label={t('admin.userEdit.accessFromAllDevices')}
              checked={policy.EnableAllDevices}
              onChange={(v) => p('EnableAllDevices', v)}
            />
          </div>
        </Card>
      )}

      {tab === 'parental' && <ParentalControls policy={policy} onChange={p} />}

      {tab === 'password' && <PasswordForm user={user.data} isSelf={isSelf} onDone={invalidate} />}

      <ConfirmDialog
        open={confirmDelete}
        title={t('admin.userEdit.deleteUser')}
        danger
        confirmLabel={t('admin.userEdit.deleteUser')}
        loading={remove.isPending}
        message={<>{tRich('admin.userEdit.deleteConfirm', { name: <strong className="text-fg">{user.data.Name}</strong> })}</>}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
      />
    </AdminPage>
  );
}

function PasswordForm({ user, isSelf, onDone }: { user: UserDto; isSelf: boolean; onDone: () => void }) {
  const api = useApi();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const mismatch = confirm.length > 0 && next !== confirm;

  const change = useMutation({
    mutationFn: () => api.post('/Users/Password', { CurrentPw: isSelf ? current : undefined, NewPw: next }, { userId: user.Id }),
    onSuccess: () => {
      toast.success(t('admin.userEdit.passwordUpdated'));
      setCurrent('');
      setNext('');
      setConfirm('');
      onDone();
    },
    onError: (e) => toast.error(e),
  });
  const reset = useMutation({
    mutationFn: () => api.post('/Users/Password', { ResetPassword: true }, { userId: user.Id }),
    onSuccess: () => {
      toast.success(t('admin.userEdit.passwordRemoved'));
      onDone();
    },
    onError: (e) => toast.error(e),
  });

  return (
    <Card
      title={t('common.password')}
      description={user.HasPassword ? t('admin.userEdit.hasPassword') : t('admin.userEdit.thisUserHasNoPassword')}
    >
      <form
        className="grid max-w-md gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!mismatch && next) change.mutate();
        }}
      >
        {isSelf && user.HasPassword && (
          <Field label={t('admin.userEdit.currentPassword')}>
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </Field>
        )}
        <Field label={t('admin.userEdit.newPassword')}>
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field
          label={t('admin.userEdit.confirmPassword')}
          hint={mismatch ? <span className="text-danger">{t('admin.userEdit.passwordMismatch')}</span> : undefined}
        >
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" loading={change.isPending} disabled={!next || mismatch}>
            {t('admin.userEdit.setPassword')}
          </Button>
          {user.HasPassword && !isSelf && (
            <Button variant="outline" loading={reset.isPending} onClick={() => reset.mutate()}>
              {t('admin.userEdit.removePassword')}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
