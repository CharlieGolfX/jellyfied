import clsx from 'clsx';
import {
  Activity,
  CalendarClock,
  FileText,
  Gauge,
  KeyRound,
  Library,
  MonitorSmartphone,
  Network,
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
import DashboardPage from './Dashboard';
import DevicesPage from './Devices';
import GeneralPage from './General';
import LibrariesPage from './Libraries';
import LogsPage from './Logs';
import NetworkPage from './Network';
import PlaybackPage from './Playback';
import PluginsPage from './Plugins';
import TasksPage from './Tasks';
import UserEditPage from './UserEdit';
import { usePageTitle } from '@/lib/usePageTitle';
import UsersPage from './Users';

const NAV: { to: string; label: string; icon: ReactNode; end?: boolean; group: string }[] = [
  { to: '/admin', label: 'Dashboard', icon: <Gauge size={18} />, end: true, group: 'Server' },
  { to: '/admin/general', label: 'General', icon: <Settings size={18} />, group: 'Server' },
  { to: '/admin/users', label: 'Users', icon: <Users size={18} />, group: 'Server' },
  { to: '/admin/libraries', label: 'Libraries', icon: <Library size={18} />, group: 'Server' },
  { to: '/admin/playback', label: 'Transcoding', icon: <Zap size={18} />, group: 'Server' },
  { to: '/admin/network', label: 'Networking', icon: <Network size={18} />, group: 'Server' },
  { to: '/admin/tasks', label: 'Scheduled Tasks', icon: <CalendarClock size={18} />, group: 'Manage' },
  { to: '/admin/activity', label: 'Activity', icon: <Activity size={18} />, group: 'Manage' },
  { to: '/admin/devices', label: 'Devices', icon: <MonitorSmartphone size={18} />, group: 'Manage' },
  { to: '/admin/plugins', label: 'Plugins', icon: <Puzzle size={18} />, group: 'Manage' },
  { to: '/admin/apikeys', label: 'API Keys', icon: <KeyRound size={18} />, group: 'Manage' },
  { to: '/admin/logs', label: 'Logs', icon: <FileText size={18} />, group: 'Manage' },
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
  usePageTitle('Server dashboard');
  const { data: user, isLoading } = useCurrentUser();
  if (isLoading) return <PageSpinner />;
  if (!user?.Policy?.IsAdministrator) {
    return <EmptyState title="Administrator access required">Only Jellyfin administrators can open the server dashboard.</EmptyState>;
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
          <Route path="playback" element={<PlaybackPage />} />
          <Route path="network" element={<NetworkPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="plugins" element={<PluginsPage />} />
          <Route path="apikeys" element={<ApiKeysPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="*" element={<EmptyState title="Page not found" />} />
        </Routes>
      </div>
    </div>
  );
}
