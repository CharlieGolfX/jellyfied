/**
 * Invite-only SyncPlay groups. Jellyfin has no such thing: every group is listed for everyone who
 * may use SyncPlay. The one thing a group carries that others can read is its name, so who may
 * see it is written there, in characters that take up no space: Jellyfin apps show the plain
 * name, and Jellyfied leaves the group out for whoever is not on the list. It keeps the group
 * out of sight in Jellyfied, it does not lock anyone out.
 */

/** Starts the list. "Invisible separator". */
const MARK = '⁣';
/** Each base-4 digit of an id is one of these: zero-width space, non-joiner, joiner, word joiner. */
const DIGITS = ['​', '‌', '‍', '⁠'];
/** The first 8 hex digits of a user id are kept: 32 bits, plenty to tell a server's users apart. */
const ID_LENGTH = 8;
const CHARS_PER_ID = ID_LENGTH * 2;

export interface GroupInvite {
  /** Short form of the creator's user id. */
  creator: string;
  /** Short forms of the invited users' ids. */
  invited: string[];
}

/** Jellyfin's ids are hex; anything else is turned into hex the same way every time. */
const shortId = (id: string) =>
  Array.from(id.replace(/-/g, '').toLowerCase().slice(0, ID_LENGTH).padEnd(ID_LENGTH, '0'), (c) =>
    /[0-9a-f]/.test(c) ? c : (c.charCodeAt(0) % 16).toString(16),
  ).join('');

function encode(id: string): string {
  let out = '';
  for (const hex of shortId(id)) {
    const n = parseInt(hex, 16);
    out += DIGITS[n >> 2] + DIGITS[n & 3];
  }
  return out;
}

function decode(chars: string): string | null {
  let out = '';
  for (let i = 0; i < chars.length; i += 2) {
    const high = DIGITS.indexOf(chars[i]);
    const low = DIGITS.indexOf(chars[i + 1]);
    if (high < 0 || low < 0) return null;
    out += ((high << 2) | low).toString(16);
  }
  return out;
}

/** The name to create an invite-only group with. */
export function inviteName(name: string, creatorId: string, invitedIds: string[]): string {
  return name + MARK + [creatorId, ...invitedIds].map(encode).join('');
}

/** The name to show for a group, and who it is for when it is invite-only. */
export function readGroupName(raw: string): { name: string; invite: GroupInvite | null } {
  const at = raw.indexOf(MARK);
  if (at < 0) return { name: raw, invite: null };
  const name = raw.slice(0, at);
  const list = raw.slice(at + 1);
  if (!list.length || list.length % CHARS_PER_ID) return { name, invite: null };
  const ids: string[] = [];
  for (let i = 0; i < list.length; i += CHARS_PER_ID) {
    const id = decode(list.slice(i, i + CHARS_PER_ID));
    if (!id) return { name, invite: null };
    ids.push(id);
  }
  return { name, invite: { creator: ids[0], invited: ids.slice(1) } };
}

/** Whether a user is shown a group: always when it is open, else when they made or were invited to it. */
export function canSeeGroup(invite: GroupInvite | null, userId: string): boolean {
  if (!invite) return true;
  const me = shortId(userId);
  return invite.creator === me || invite.invited.includes(me);
}

/** Whether a user made the group. */
export function isGroupCreator(invite: GroupInvite | null, userId: string): boolean {
  return invite?.creator === shortId(userId);
}
