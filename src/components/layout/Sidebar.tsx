import clsx from 'clsx';
import { Heart, Home, LayoutDashboard } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useUserViews } from '@/api/queries';
import { useIsAdmin } from '@/auth/AuthProvider';
import { LibraryIcon } from './libraryIcon';

function SideLink({
  to,
  icon,
  label,
  collapsed,
  end,
  onNavigate,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  collapsed: boolean;
  end?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      onClick={onNavigate}
      className={({ isActive }) =>
        clsx(
          'relative flex h-11 items-center gap-3.5 rounded-md px-3 text-[15px] transition-colors',
          collapsed && 'justify-center px-0',
          isActive ? 'bg-white/10 font-semibold text-fg' : 'text-muted hover:bg-white/5 hover:text-fg',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r bg-accent" />}
          <span className={clsx('shrink-0', isActive && 'text-accent')}>{icon}</span>
          {!collapsed && <span className="truncate">{label}</span>}
        </>
      )}
    </NavLink>
  );
}

export function Sidebar({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { data: views, isLoading } = useUserViews();
  const isAdmin = useIsAdmin();

  return (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto px-2 py-3">
      <SideLink to="/" end icon={<Home size={20} strokeWidth={1.75} />} label="Home" collapsed={collapsed} onNavigate={onNavigate} />
      <SideLink
        to="/favorites"
        icon={<Heart size={20} strokeWidth={1.75} />}
        label="Favorites"
        collapsed={collapsed}
        onNavigate={onNavigate}
      />

      <div className="my-2 h-px bg-white/10" />
      {!collapsed && (
        <div className="px-3 pt-1 pb-1.5 text-[11px] font-semibold tracking-wider text-faint uppercase">Libraries</div>
      )}
      {isLoading &&
        Array.from({ length: 4 }, (_, i) => <div key={i} className="mx-1 my-1 h-8 animate-pulse rounded bg-white/5" />)}
      {views?.Items.map((view) => (
        <SideLink
          key={view.Id}
          to={`/library/${view.Id}`}
          icon={<LibraryIcon type={view.CollectionType} />}
          label={view.Name ?? 'Library'}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}

      {isAdmin && (
        <>
          <div className="my-2 h-px bg-white/10" />
          <SideLink
            to="/admin"
            icon={<LayoutDashboard size={20} strokeWidth={1.75} />}
            label="Dashboard"
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        </>
      )}
    </nav>
  );
}
