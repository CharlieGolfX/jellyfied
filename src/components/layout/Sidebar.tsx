import clsx from 'clsx';
import { GripVertical, Heart, Home, LayoutDashboard } from 'lucide-react';
import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { MEDIA, useUserViews } from '@/api/queries';
import type { ItemsResult, UserDto } from '@/api/types';
import { useApi, useIsAdmin, useSession } from '@/auth/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import { useT } from '@/i18n';
import { LibraryIcon } from './libraryIcon';

function SideLink({
  to,
  icon,
  label,
  collapsed,
  end,
  onNavigate,
  trailing,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  collapsed: boolean;
  end?: boolean;
  onNavigate?: () => void;
  trailing?: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      draggable={false}
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
          {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
          {!collapsed && trailing}
        </>
      )}
    </NavLink>
  );
}

/**
 * Drag-and-drop library ordering. The order is saved to the user's Jellyfin configuration
 * (OrderedViews), so it also applies to the home page and other Jellyfin clients.
 */
function useLibraryOrder(views: ItemsResult | undefined) {
  const api = useApi();
  const { userId } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  /** Order shown while dragging or saving; null means "use the server's order". */
  const [order, setOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const dropped = useRef(false);

  const serverIds = views?.Items.map((v) => v.Id) ?? [];
  const ids = order ?? serverIds;
  const items = ids.map((id) => views?.Items.find((v) => v.Id === id)).filter((v) => v !== undefined);

  const save = async (next: string[]) => {
    try {
      // Re-read the configuration so other preferences aren't overwritten with stale values.
      const me = await api.get<UserDto>('/Users/Me');
      await api.post('/Users/Configuration', { ...me.Configuration, OrderedViews: next }, { userId });
      qc.setQueryData<ItemsResult>([MEDIA, 'views', userId], (old) =>
        old
          ? {
              ...old,
              Items: next.map((id) => old.Items.find((v) => v.Id === id)).filter((v) => v !== undefined),
            }
          : old,
      );
      void qc.invalidateQueries({ queryKey: ['me'] });
      void qc.invalidateQueries({ queryKey: [MEDIA, 'views'] });
    } catch (err) {
      toast.error(err);
    } finally {
      setOrder(null);
    }
  };

  const dragProps = (id: string) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      dropped.current = false;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
      setDragId(id);
      setOrder(ids);
    },
    onDragOver: (e: DragEvent) => {
      if (!dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (id === dragId) return;
      setOrder((cur) => {
        const list = [...(cur ?? ids)];
        const from = list.indexOf(dragId);
        const to = list.indexOf(id);
        if (from < 0 || to < 0) return cur;
        list.splice(from, 1);
        list.splice(to, 0, dragId);
        return list;
      });
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      dropped.current = true;
    },
    onDragEnd: () => {
      setDragId(null);
      const next = order;
      if (dropped.current && next && next.join() !== serverIds.join()) void save(next);
      else setOrder(null);
    },
  });

  // Accept drops anywhere in the list (including the gaps between items).
  const containerProps = {
    onDragOver: (e: DragEvent) => {
      if (dragId) e.preventDefault();
    },
    onDrop: (e: DragEvent) => {
      if (!dragId) return;
      e.preventDefault();
      dropped.current = true;
    },
  };

  return { items, dragId, dragProps, containerProps };
}

export function Sidebar({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const t = useT();
  const { data: views, isLoading } = useUserViews();
  const isAdmin = useIsAdmin();
  const { items, dragId, dragProps, containerProps } = useLibraryOrder(views);

  return (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto px-2 py-3">
      <SideLink
        to="/"
        end
        icon={<Home size={20} strokeWidth={1.75} />}
        label={t('common.home')}
        collapsed={collapsed}
        onNavigate={onNavigate}
      />
      <SideLink
        to="/favorites"
        icon={<Heart size={20} strokeWidth={1.75} />}
        label={t('nav.favorites')}
        collapsed={collapsed}
        onNavigate={onNavigate}
      />

      <div className="my-2 h-px bg-white/10" />
      {!collapsed && (
        <div className="px-3 pt-1 pb-1.5 text-[11px] font-semibold tracking-wider text-faint uppercase">{t('nav.libraries')}</div>
      )}
      {isLoading && Array.from({ length: 4 }, (_, i) => <div key={i} className="mx-1 my-1 h-8 animate-pulse rounded bg-white/5" />)}
      <div className="flex flex-col gap-1" {...containerProps}>
        {items.map((view) => (
          <div
            key={view.Id}
            {...dragProps(view.Id)}
            className={clsx('group/lib rounded-md', dragId === view.Id && 'opacity-40')}
            title={collapsed ? undefined : t('nav.dragToReorder')}
          >
            <SideLink
              to={`/library/${view.Id}`}
              icon={<LibraryIcon type={view.CollectionType} />}
              label={view.Name ?? t('nav.library')}
              collapsed={collapsed}
              onNavigate={onNavigate}
              trailing={
                <GripVertical
                  size={16}
                  className="shrink-0 cursor-grab text-faint opacity-0 transition-opacity group-hover/lib:opacity-100"
                  aria-hidden
                />
              }
            />
          </div>
        ))}
      </div>

      {isAdmin && (
        <>
          <div className="my-2 h-px bg-white/10" />
          <SideLink
            to="/admin"
            icon={<LayoutDashboard size={20} strokeWidth={1.75} />}
            label={t('nav.dashboard')}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        </>
      )}
    </nav>
  );
}
