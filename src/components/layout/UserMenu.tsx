import { LayoutDashboard, LogOut, Settings, User, UserPlus, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApi, useAuth, useCurrentUser, useSession } from '@/auth/AuthProvider';
import { Menu } from '@/components/ui/Menu';
import { Img } from '@/components/ui/States';
import { APP_NAME, APP_VERSION } from '@/config';

export function Avatar({ userId, tag, name, size = 32 }: { userId: string; tag?: string | null; name?: string; size?: number }) {
  const api = useApi();
  const initial = (name ?? '?').trim().charAt(0).toUpperCase();
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand-purple to-accent font-semibold text-accent-ink"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {tag ? (
        <Img src={api.userImageUrl(userId, tag, size * 2)} className="absolute inset-0 h-full w-full object-cover" fallback={initial} />
      ) : (
        initial || <User size={size * 0.5} />
      )}
    </span>
  );
}

export function UserMenu() {
  const { logout, otherAccounts, switchAccount, addAccount } = useAuth();
  const session = useSession();
  const { data: user } = useCurrentUser();
  const navigate = useNavigate();
  const isAdmin = Boolean(user?.Policy?.IsAdministrator);

  return (
    <Menu
      width={240}
      items={[
        { header: true, label: `${user?.Name ?? session.userName} · ${session.serverName}` },
        { label: 'Account settings', icon: <Settings size={16} />, onSelect: () => navigate('/settings') },
        ...(isAdmin ? [{ label: 'Server dashboard', icon: <LayoutDashboard size={16} />, onSelect: () => navigate('/admin') }] : []),
        { divider: true, label: '' },
        ...otherAccounts.map((a) => ({
          label: `Switch to ${a.userName}${a.serverName !== session.serverName ? ` · ${a.serverName}` : ''}`,
          icon: <Users size={16} />,
          onSelect: () => switchAccount(a),
        })),
        { label: 'Add another account', icon: <UserPlus size={16} />, onSelect: addAccount },
        { divider: true, label: '' },
        {
          label: 'Sign out',
          icon: <LogOut size={16} />,
          onSelect: async () => {
            await logout();
            navigate('/login');
          },
        },
        { divider: true, label: '' },
        { header: true, label: `${APP_NAME} ${APP_VERSION}` },
      ]}
      trigger={({ toggle, open }) => (
        <button
          onClick={toggle}
          aria-expanded={open}
          aria-label="Account menu"
          className="rounded-full ring-2 ring-transparent transition hover:ring-white/30"
        >
          <Avatar userId={session.userId} tag={user?.PrimaryImageTag} name={user?.Name ?? session.userName} />
        </button>
      )}
    />
  );
}
