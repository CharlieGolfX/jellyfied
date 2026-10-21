import { readGroupName, type GroupInvite } from './syncplayInviteList';

/** What the server's SyncPlay messages and answers look like, and how to read them. */

export const TICKS_PER_MS = 10_000;

export interface SyncPlayGroup {
  GroupId: string;
  GroupName: string;
  State: 'Idle' | 'Waiting' | 'Paused' | 'Playing';
  Participants: string[];
  /** Who may see the group in Jellyfied, when it is invite-only. GroupName is then the plain name. */
  Invite?: GroupInvite | null;
}

/** A group as the server sends it, with the invite list (if any) taken out of its name. */
export function fromServer(group: SyncPlayGroup): SyncPlayGroup {
  const { name, invite } = readGroupName(group.GroupName ?? '');
  return { ...group, GroupName: name, Invite: invite };
}

export interface QueueItem {
  ItemId: string;
  PlaylistItemId: string;
}

export interface QueueUpdate {
  Reason: string;
  LastUpdate: string;
  Playlist: QueueItem[];
  PlayingItemIndex: number;
  StartPositionTicks: number;
  IsPlaying: boolean;
  ShuffleMode?: 'Sorted' | 'Shuffle';
  RepeatMode?: 'RepeatOne' | 'RepeatAll' | 'RepeatNone';
}

/** The group's queue as the music player shows it. */
export interface SyncPlayQueueState {
  queue: string[];
  index: number;
  repeat: 'off' | 'all' | 'one';
  shuffled: boolean;
}

export interface GroupUpdate {
  GroupId: string;
  Type:
    | 'UserJoined'
    | 'UserLeft'
    | 'GroupJoined'
    | 'GroupLeft'
    | 'StateUpdate'
    | 'PlayQueue'
    | 'NotInGroup'
    | 'GroupDoesNotExist'
    | 'LibraryAccessDenied';
  Data: unknown;
}

export interface SyncCommand {
  GroupId: string;
  PlaylistItemId: string;
  When: string;
  PositionTicks: number | null;
  Command: 'Unpause' | 'Pause' | 'Stop' | 'Seek';
}

/** Request to open the player for a group item. */
export interface SyncPlayOpenRequest {
  itemId: string;
  playlistItemId: string;
  startPositionTicks: number;
  queue: string[];
  /** Where `itemId` is in `queue`. */
  index: number;
}

export type SyncPlayNotice = { type: 'joined' | 'left'; user: string } | { type: 'info' | 'error'; message: string };

/** The server writes 7 fractional digits; keep 3 so every browser parses it. */
export function parseTime(iso: string): number {
  return Date.parse(iso.replace(/(\.\d{3})\d+/, '$1'));
}

export const normId = (id: string) => id.replace(/-/g, '').toLowerCase();
