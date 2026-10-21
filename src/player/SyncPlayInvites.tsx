import { Users } from 'lucide-react';
import clsx from 'clsx';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useCurrentUser, useSession } from '@/auth/AuthProvider';
import { Avatar } from '@/components/layout/UserMenu';
import { useToast } from '@/components/ui/Toast';
import { t } from '@/i18n';
import { isGroupCreator } from './syncplayInviteList';
import { isPlayPath } from './VideoSession';
import { useServerUsers, useSyncPlay, useSyncPlayGroups, useSyncPlayManager } from './SyncPlayProvider';

/** How often to look for new invitations. Jellyfin says nothing when a group is created. */
const CHECK_INTERVAL = 15_000;
const ANSWERED_KEY = 'jellyfied.syncPlayInvitesAnswered';
/** Group ids are only kept this long a list: older groups are long over. */
const ANSWERED_LIMIT = 50;

function readAnswered(): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(ANSWERED_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function saveAnswered(list: string[]) {
  try {
    localStorage.setItem(ANSWERED_KEY, JSON.stringify(list.slice(-ANSWERED_LIMIT)));
  } catch {
    /* ignore */
  }
}

/**
 * Asks the user to join an invite-only SyncPlay group they were invited to. Each invitation is
 * asked about once; a declined group stays in the SyncPlay menu.
 */
export function SyncPlayInvites() {
  const manager = useSyncPlayManager();
  const sync = useSyncPlay();
  const session = useSession();
  const toast = useToast();
  const { data: user } = useCurrentUser();
  const [answered, setAnswered] = useState(readAnswered);
  const [busy, setBusy] = useState(false);
  const { pathname } = useLocation();

  const access = user?.Policy?.SyncPlayAccess ?? 'CreateAndJoinGroups';
  const groups = useSyncPlayGroups(Boolean(user) && access !== 'None', CHECK_INTERVAL);
  const invite = (groups.data ?? []).find(
    (g) => g.Invite && g.GroupId !== sync.group?.GroupId && !isGroupCreator(g.Invite, session.userId) && !answered.includes(g.GroupId),
  );
  const users = useServerUsers(Boolean(invite));

  if (!manager || !invite) return null;

  const inviter = users.data?.find((u) => isGroupCreator(invite.Invite ?? null, u.Id));
  const answer = () => {
    const next = [...answered, invite.GroupId];
    setAnswered(next);
    saveAnswered(next);
  };
  const join = async () => {
    setBusy(true);
    try {
      await manager.joinGroup(invite.GroupId);
      answer();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-labelledby="syncplay-invite-title"
      className={clsx(
        'animate-pop-in fixed top-16 right-4 w-80 max-w-[calc(100vw-2rem)] rounded-lg bg-base-750 p-4 shadow-2xl ring-1 ring-black/40',
        // Under the top bar's menus, so it never covers one; over the full-screen player, which has no top bar.
        isPlayPath(pathname) ? 'z-[55]' : 'z-[35]',
      )}
    >
      <div className="flex gap-3">
        {inviter ? (
          <Avatar userId={inviter.Id} tag={inviter.PrimaryImageTag} name={inviter.Name} size={36} />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Users size={18} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div id="syncplay-invite-title" className="text-sm font-semibold">
            {inviter ? t('player.syncPlayInvites.invitedBy', { name: inviter.Name }) : t('player.syncPlayInvites.invited')}
          </div>
          <div className="mt-0.5 truncate text-sm text-muted">{invite.GroupName}</div>
          {invite.Participants.length > 0 && (
            <div className="truncate text-xs text-faint">
              {t('player.syncPlayInvites.inGroup', { names: invite.Participants.join(', ') })}
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-white/10 hover:text-fg" disabled={busy} onClick={answer}>
          {t('player.syncPlayInvites.decline')}
        </button>
        <button
          className="rounded-md bg-accent-fill px-3 py-1.5 text-sm font-medium text-accent-ink hover:brightness-110 disabled:opacity-50"
          disabled={busy}
          onClick={() => void join()}
        >
          {t('player.syncPlayInvites.join')}
        </button>
      </div>
    </div>
  );
}
