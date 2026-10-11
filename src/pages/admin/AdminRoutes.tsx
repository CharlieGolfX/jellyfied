import clsx from 'clsx';
import {
  Activity,
  CalendarClock,
  DatabaseBackup,
  FileText,
  FileCog,
  Gauge,
  KeyRound,
  Library,
  MonitorSmartphone,
  Network,
  Paintbrush,
  Puzzle,
  Settings,
  Users,
  Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { useCurrentUser } from '@/auth/AuthProvider';
import { PageSpinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/States';
import ActivityPage from './Activity';
import ApiKeysPage from './ApiKeys';
import BackupsPage from './Backups';
import BrandingPage from './Branding';
import DashboardPage from './Dashboard';
import DevicesPage from './Devices';
import GeneralPage from './General';
import LibrariesPage from './Libraries';
import LogsPage from './Logs';
import MetadataPage from './Metadata';
import NetworkPage from './Network';
import PlaybackPage from './Playback';
import PluginsPage from './Plugins';
import TasksPage from './Tasks';
import UserEditPage from './UserEdit';
import { usePageTitle } from '@/lib/usePageTitle';
import UsersPage from './Users';
import { t } from '@/i18n';

const NAV: { to: string; label: string; icon: ReactNode; end?: boolean; group: string }[] = [
  {
    to: '/admin',
    label: t('admin.adminRoutes.dashboard'),
    icon: <Gauge size={18} />,
    end: true,
    group: t('admin.adminRoutes.groupServer'),
  },
  { to: '/admin/general', label: t('admin.adminRoutes.general'), icon: <Settings size={18} />, group: t('admin.adminRoutes.groupServer') },
  { to: '/admin/users', label: t('admin.adminRoutes.users'), icon: <Users size={18} />, group: t('admin.adminRoutes.groupServer') },
  {
    to: '/admin/libraries',
    label: t('admin.adminRoutes.libraries'),
    icon: <Library size={18} />,
    group: t('admin.adminRoutes.groupServer'),
  },
  { to: '/admin/metadata', label: t('common.metadata'), icon: <FileCog size={18} />, group: t('admin.adminRoutes.groupServer') },
  { to: '/admin/playback', label: t('common.transcoding'), icon: <Zap size={18} />, group: t('admin.adminRoutes.groupServer') },
  {
    to: '/admin/network',
    label: t('admin.adminRoutes.networking'),
    icon: <Network size={18} />,
    group: t('admin.adminRoutes.groupServer'),
  },
  {
    to: '/admin/branding',
    label: t('admin.adminRoutes.branding'),
    icon: <Paintbrush size={18} />,
    group: t('admin.adminRoutes.groupServer'),
  },
  {
    to: '/admin/tasks',
    label: t('admin.adminRoutes.scheduledTasks'),
    icon: <CalendarClock size={18} />,
    group: t('admin.adminRoutes.groupManage'),
  },
  {
    to: '/admin/activity',
    label: t('admin.adminRoutes.activity'),
    icon: <Activity size={18} />,
    group: t('admin.adminRoutes.groupManage'),
  },
  {
    to: '/admin/devices',
    label: t('admin.adminRoutes.devices'),
    icon: <MonitorSmartphone size={18} />,
    group: t('admin.adminRoutes.groupManage'),
  },
  { to: '/admin/plugins', label: t('admin.adminRoutes.plugins'), icon: <Puzzle size={18} />, group: t('admin.adminRoutes.groupManage') },
  {
    to: '/admin/backups',
    label: t('admin.adminRoutes.backups'),
    icon: <DatabaseBackup size={18} />,
    group: t('admin.adminRoutes.groupManage'),
  },
  { to: '/admin/apikeys', label: t('admin.adminRoutes.apiKeys'), icon: <KeyRound size={18} />, group: t('admin.adminRoutes.groupManage') },
  { to: '/admin/logs', label: t('admin.adminRoutes.logs'), icon: <FileText size={18} />, group: t('admin.adminRoutes.groupManage') },
];

function AdminNav() {
  const groups = [...new Set(NAV.map((n) => n.group))];
  return (
    <nav className="flex gap-1 overflow-x-auto px-4 py-3 scrollbar-none lg:block lg:space-y-0.5 lg:overflow-visible lg:px-3 lg:py-6">
      {groups.map((g) => (
        <div key={g} className="contents lg:block lg:pb-4">
          <div className="hidden px-3 pb-2 text-[11px] font-semibold tracking-wider text-faint uppercase lg:block">{g}</div>
          {NAV.filter((n) => n.group === g).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                clsx(
                  'flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors',
                  isActive ? 'bg-white/10 font-semibold text-fg' : 'text-muted hover:bg-white/5 hover:text-fg',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={isActive ? 'text-accent' : undefined}>{n.icon}</span>
                  {n.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

export default function AdminRoutes() {
  usePageTitle(t('admin.adminRoutes.serverDashboard'));
  const { data: user, isLoading } = useCurrentUser();
  if (isLoading) return <PageSpinner />;
  if (!user?.Policy?.IsAdministrator) {
    return (
      <EmptyState title={t('admin.adminRoutes.administratorAccessRequired')}>
        {t('admin.adminRoutes.onlyJellyfinAdministratorsCanOpen')}
      </EmptyState>
    );
  }

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <aside className="shrink-0 border-b border-white/5 lg:w-56 lg:border-r lg:border-b-0">
        <div className="lg:sticky lg:top-0">
          <AdminNav />
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <Routes>
          <Route index element={<DashboardPage />} />
          <Route path="general" element={<GeneralPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="users/:userId" element={<UserEditPage />} />
          <Route path="libraries" element={<LibrariesPage />} />
          <Route path="metadata" element={<MetadataPage />} />
          <Route path="branding" element={<BrandingPage />} />
          <Route path="backups" element={<BackupsPage />} />
          <Route path="playback" element={<PlaybackPage />} />
          <Route path="network" element={<NetworkPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="plugins" element={<PluginsPage />} />
          <Route path="apikeys" element={<ApiKeysPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="*" element={<EmptyState title={t('admin.adminRoutes.pageNotFound')} />} />
        </Routes>
      </div>
    </div>
  );
}
