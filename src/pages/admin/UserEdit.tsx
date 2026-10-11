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
import { AdminPage } from './shared';

type Tab = 'profile' | 'access' | 'password';

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
      toast.success('User saved');
      invalidate();
    },
    onError: (e) => toast.error(e),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/Users/${userId}`),
    onSuccess: () => {
      toast.success('User deleted');
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
          <ArrowLeft size={14} /> All users
        </Link>
      }
      actions={
        <>
          {!isSelf && (
            <Button variant="outline" icon={<Trash2 size={16} />} onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          )}
          {tab !== 'password' && (
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
              Save changes
            </Button>
          )}
        </>
      }
    >
      <div className="flex items-center gap-4">
        <Avatar userId={user.data.Id} tag={user.data.PrimaryImageTag} name={user.data.Name} size={56} />
        <div className="flex gap-1 rounded-lg bg-base-800/70 p-1 ring-1 ring-white/5">
          {(['profile', 'access', 'password'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                'rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors',
                tab === t ? 'bg-white/10 text-fg' : 'text-muted hover:text-fg',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'profile' && (
        <>
          <Card title="Profile">
            <Field label="Username" className="max-w-sm">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div className="mt-3 divide-y divide-white/5">
              <Switch
                label="Administrator"
                description="Full access to the server dashboard and all settings."
                checked={policy.IsAdministrator}
                disabled={isSelf}
                onChange={(v) => p('IsAdministrator', v)}
              />
              <Switch
                label="Disable this user"
                description="The user won’t be able to sign in."
                checked={policy.IsDisabled}
                disabled={isSelf}
                onChange={(v) => p('IsDisabled', v)}
              />
              <Switch label="Hide from login screen" checked={policy.IsHidden} onChange={(v) => p('IsHidden', v)} />
              <Switch label="Allow remote connections" checked={policy.EnableRemoteAccess} onChange={(v) => p('EnableRemoteAccess', v)} />
            </div>
          </Card>

          <Card title="Playback">
            <div className="divide-y divide-white/5">
              <Switch label="Allow media playback" checked={policy.EnableMediaPlayback} onChange={(v) => p('EnableMediaPlayback', v)} />
              <Switch
                label="Allow audio transcoding"
                checked={policy.EnableAudioPlaybackTranscoding}
                onChange={(v) => p('EnableAudioPlaybackTranscoding', v)}
              />
              <Switch
                label="Allow video transcoding"
                checked={policy.EnableVideoPlaybackTranscoding}
                onChange={(v) => p('EnableVideoPlaybackTranscoding', v)}
              />
              <Switch
                label="Allow remuxing (container changes without re-encoding)"
                checked={policy.EnablePlaybackRemuxing}
                onChange={(v) => p('EnablePlaybackRemuxing', v)}
              />
              <Switch
                label="Force transcoding of remote media sources"
                checked={policy.ForceRemoteSourceTranscoding}
                onChange={(v) => p('ForceRemoteSourceTranscoding', v)}
              />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Remote bitrate limit (Mbps)" hint="0 = no limit">
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={policy.RemoteClientBitrateLimit ? policy.RemoteClientBitrateLimit / 1_000_000 : 0}
                  onChange={(e) => p('RemoteClientBitrateLimit', Math.round(Number(e.target.value || 0) * 1_000_000))}
                />
              </Field>
              <Field label="Max active sessions" hint="0 = unlimited">
                <Input
                  type="number"
                  min={0}
                  value={policy.MaxActiveSessions ?? 0}
                  onChange={(e) => p('MaxActiveSessions', Number(e.target.value || 0))}
                />
              </Field>
              <Field label="Failed logins before lockout" hint="-1 = default, 0 = never">
                <Input
                  type="number"
                  min={-1}
                  value={policy.LoginAttemptsBeforeLockout ?? -1}
                  onChange={(e) => p('LoginAttemptsBeforeLockout', Number(e.target.value || 0))}
                />
              </Field>
            </div>
          </Card>

          <Card title="Permissions">
            <div className="divide-y divide-white/5">
              <Switch
                label="Allow media downloads"
                checked={policy.EnableContentDownloading}
                onChange={(v) => p('EnableContentDownloading', v)}
              />
              <Switch
                label="Allow media deletion from all libraries"
                checked={policy.EnableContentDeletion}
                onChange={(v) => p('EnableContentDeletion', v)}
              />
              {'EnableCollectionManagement' in policy && (
                <Switch
                  label="Allow managing collections"
                  checked={Boolean(policy.EnableCollectionManagement)}
                  onChange={(v) => p('EnableCollectionManagement', v)}
                />
              )}
              {'EnableSubtitleManagement' in policy && (
                <Switch
                  label="Allow managing subtitles"
                  checked={Boolean(policy.EnableSubtitleManagement)}
                  onChange={(v) => p('EnableSubtitleManagement', v)}
                />
              )}
              <Switch
                label="Allow remote control of other users"
                checked={policy.EnableRemoteControlOfOtherUsers}
                onChange={(v) => p('EnableRemoteControlOfOtherUsers', v)}
              />
              <Switch
                label="Allow remote control of shared devices"
                checked={policy.EnableSharedDeviceControl}
                onChange={(v) => p('EnableSharedDeviceControl', v)}
              />
              <Switch label="Allow Live TV access" checked={policy.EnableLiveTvAccess} onChange={(v) => p('EnableLiveTvAccess', v)} />
              <Switch
                label="Allow Live TV recording management"
                checked={policy.EnableLiveTvManagement}
                onChange={(v) => p('EnableLiveTvManagement', v)}
              />
            </div>
            {!policy.EnableContentDeletion && (folders.data?.Items.length ?? 0) > 0 && (
              <div className="mt-4">
                <div className="mb-1 text-sm font-medium">Allow deletion from these libraries</div>
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
        <Card title="Library access">
          <Switch label="Access to all libraries" checked={policy.EnableAllFolders} onChange={(v) => p('EnableAllFolders', v)} />
          {!policy.EnableAllFolders && (
            <div className="mt-2 rounded-md bg-black/20 p-3">
              {folders.isLoading && <p className="text-sm text-muted">Loading libraries…</p>}
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
            <Switch label="Access from all devices" checked={policy.EnableAllDevices} onChange={(v) => p('EnableAllDevices', v)} />
          </div>
        </Card>
      )}

      {tab === 'password' && <PasswordForm user={user.data} isSelf={isSelf} onDone={invalidate} />}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete user"
        danger
        confirmLabel="Delete user"
        loading={remove.isPending}
        message={
          <>
            Delete <strong className="text-fg">{user.data.Name}</strong>? Their watch history and settings will be removed.
          </>
        }
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
      toast.success('Password updated');
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
      toast.success('Password removed');
      onDone();
    },
    onError: (e) => toast.error(e),
  });

  return (
    <Card title="Password" description={user.HasPassword ? 'This user has a password.' : 'This user has no password.'}>
      <form
        className="grid max-w-md gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!mismatch && next) change.mutate();
        }}
      >
        {isSelf && user.HasPassword && (
          <Field label="Current password">
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </Field>
        )}
        <Field label="New password">
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Confirm password" hint={mismatch ? <span className="text-danger">Passwords don’t match</span> : undefined}>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" loading={change.isPending} disabled={!next || mismatch}>
            Set password
          </Button>
          {user.HasPassword && !isSelf && (
            <Button variant="outline" loading={reset.isPending} onClick={() => reset.mutate()}>
              Remove password
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
