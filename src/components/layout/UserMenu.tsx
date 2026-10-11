import { LayoutDashboard, Lock, LogOut, Settings, User, UserPlus, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { hasPin } from '@/auth/accountPin';
import { useApi, useAuth, useCurrentUser, useSession } from '@/auth/AuthProvider';
import { useGuardedSwitch } from '@/auth/PinPrompt';
import { Menu } from '@/components/ui/Menu';
import { Img } from '@/components/ui/States';
import { APP_NAME, APP_VERSION } from '@/config';
import { t } from '@/i18n';

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
  const { logout, otherAccounts, addAccount } = useAuth();
  const { switchTo, dialog } = useGuardedSwitch();
  const session = useSession();
  const { data: user } = useCurrentUser();
  const navigate = useNavigate();
  const isAdmin = Boolean(user?.Policy?.IsAdministrator);

  return (
    <>
      {dialog}
      <Menu
        width={240}
        items={[
          { header: true, label: `${user?.Name ?? session.userName} · ${session.serverName}` },
          { label: t('userMenu.accountSettings'), icon: <Settings size={16} />, onSelect: () => navigate('/settings') },
          ...(isAdmin
            ? [{ label: t('nav.serverDashboard'), icon: <LayoutDashboard size={16} />, onSelect: () => navigate('/admin') }]
            : []),
          { divider: true, label: '' },
          ...otherAccounts.map((a) => ({
            label: t('userMenu.switchTo', { name: a.serverName !== session.serverName ? `${a.userName} · ${a.serverName}` : a.userName }),
            icon: hasPin(a) ? <Lock size={16} /> : <Users size={16} />,
            onSelect: () => switchTo(a),
          })),
          { label: t('userMenu.addAccount'), icon: <UserPlus size={16} />, onSelect: addAccount },
          { divider: true, label: '' },
          {
            label: t('userMenu.signOut'),
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
            aria-label={t('userMenu.open')}
            className="rounded-full ring-2 ring-transparent transition hover:ring-white/30"
          >
            <Avatar userId={session.userId} tag={user?.PrimaryImageTag} name={user?.Name ?? session.userName} />
          </button>
        )}
      />
    </>
  );
}
