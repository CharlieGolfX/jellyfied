import { ShieldCheck, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserDto } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { Avatar } from '@/components/layout/UserMenu';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { PageSpinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { formatRelative } from '@/lib/format';
import { AdminPage, StatusPill } from './shared';

export function useUsers() {
  const api = useApi();
  return useQuery({ queryKey: ['admin', 'users'], queryFn: () => api.get<UserDto[]>('/Users') });
}

export default function UsersPage() {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useUsers();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  const create = useMutation({
    mutationFn: () => api.post<UserDto>('/Users/New', { Name: name.trim(), Password: password }),
    onSuccess: (user) => {
      toast.success(`Created ${user.Name}`);
      setOpen(false);
      setName('');
      setPassword('');
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      navigate(`/admin/users/${user.Id}`);
    },
    onError: (e) => toast.error(e),
  });

  return (
    <AdminPage
      title="Users"
      description="Manage who can sign in, what they can access and what they’re allowed to do."
      actions={
        <Button variant="primary" icon={<UserPlus size={16} />} onClick={() => setOpen(true)}>
          Add user
        </Button>
      }
    >
      {isLoading ? (
        <PageSpinner />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data!.map((u) => (
            <Link
              key={u.Id}
              to={`/admin/users/${u.Id}`}
              className="flex items-center gap-4 rounded-lg bg-base-800/70 p-4 ring-1 ring-white/5 transition hover:bg-base-750 hover:ring-white/15"
            >
              <Avatar userId={u.Id} tag={u.PrimaryImageTag} name={u.Name} size={48} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{u.Name}</span>
                  {u.Policy.IsAdministrator && <ShieldCheck size={15} className="shrink-0 text-accent" aria-label="Administrator" />}
                </div>
                <div className="truncate text-xs text-muted">Last active {formatRelative(u.LastActivityDate)}</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {u.Policy.IsDisabled && <StatusPill tone="red">Disabled</StatusPill>}
                  {u.Policy.IsHidden && <StatusPill tone="gray">Hidden</StatusPill>}
                  {!u.HasPassword && <StatusPill tone="amber">No password</StatusPill>}
                  {u.Policy.IsAdministrator && <StatusPill tone="blue">Admin</StatusPill>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add user"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={create.isPending} disabled={!name.trim()} onClick={() => create.mutate()}>
              Create
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <Field label="Username">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Password" hint="Optional. Users without a password can sign in by tapping their profile.">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <button type="submit" className="hidden" />
        </form>
      </Modal>
    </AdminPage>
  );
}
