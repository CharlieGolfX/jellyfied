import { describe, expect, it } from 'vitest';
import { canSeeGroup, inviteName, readGroupName } from './syncplayInviteList';

const ANN = 'a1b2c3d4-0000-4000-8000-000000000001';
const BOB = 'F00DBABE00004000800000000000000A';
const CAT = '0123456789abcdef0123456789abcdef';

describe('invite-only group names', () => {
  it('look like the plain name, and read back the creator and who was invited', () => {
    const name = inviteName("Ann's group", ANN, [BOB]);
    expect(name.startsWith("Ann's group")).toBe(true);
    expect(name.trim()).toBe(name);
    expect(readGroupName(name)).toEqual({ name: "Ann's group", invite: { creator: 'a1b2c3d4', invited: ['f00dbabe'] } });
  });

  it('a group without the marker is open to everyone', () => {
    expect(readGroupName('Movie night')).toEqual({ name: 'Movie night', invite: null });
  });

  it('a damaged list is shown as an open group with the plain name', () => {
    const name = inviteName('Movie night', ANN, [BOB]);
    expect(readGroupName(name.slice(0, -3))).toEqual({ name: 'Movie night', invite: null });
  });

  it('is seen by its creator and the invited, and by nobody else', () => {
    const { invite } = readGroupName(inviteName('Movie night', ANN, [BOB]));
    expect(canSeeGroup(invite, ANN)).toBe(true);
    expect(canSeeGroup(invite, BOB.toLowerCase())).toBe(true);
    expect(canSeeGroup(invite, CAT)).toBe(false);
    expect(canSeeGroup(null, CAT)).toBe(true);
  });

  it('works for ids that are not hex as well', () => {
    const { invite } = readGroupName(inviteName('Movie night', 'user-1', ['user-2']));
    expect(canSeeGroup(invite, 'user-2')).toBe(true);
    expect(canSeeGroup(invite, 'user-3')).toBe(false);
  });
});
