import { describe, expect, it } from 'vitest';
import { userDataPatches } from './LiveUpdates';

describe('userDataPatches', () => {
  it('gives each changed item’s new user data, under the id the lists use', () => {
    expect(
      userDataPatches({
        UserDataList: [
          { ItemId: 'AAAA-bbbb', Key: 'k', Played: true, PlaybackPositionTicks: 0, IsFavorite: false },
          { Key: 'no-id', Played: true },
        ],
      } as never),
    ).toEqual([['aaaabbbb', { Played: true, PlaybackPositionTicks: 0, IsFavorite: false }]]);
  });

  it('is empty for a message without a list', () => {
    expect(userDataPatches(undefined)).toEqual([]);
    expect(userDataPatches({})).toEqual([]);
  });
});
