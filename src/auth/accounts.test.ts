import { describe, expect, it } from 'vitest';
import { sameAccount, withAccount, type StoredSession } from './AuthProvider';

const account = (userId: string, serverUrl = 'http://a', accessToken = 't'): StoredSession => ({
  serverUrl,
  serverId: 's',
  serverName: 'Server',
  userId,
  userName: userId,
  accessToken,
});

describe('saved accounts', () => {
  it('tells accounts apart by user and server', () => {
    expect(sameAccount(account('u1'), account('u1'))).toBe(true);
    expect(sameAccount(account('u1'), account('u2'))).toBe(false);
    expect(sameAccount(account('u1'), account('u1', 'http://b'))).toBe(false);
  });

  it('puts the account that just signed in first', () => {
    expect(withAccount([account('u1')], account('u2')).map((a) => a.userId)).toEqual(['u2', 'u1']);
  });

  it('replaces an account that signs in again, keeping its newest token', () => {
    const list = withAccount([account('u1', 'http://a', 'old'), account('u2')], account('u1', 'http://a', 'new'));
    expect(list.map((a) => a.userId)).toEqual(['u1', 'u2']);
    expect(list[0].accessToken).toBe('new');
  });

  it('forgets an account', () => {
    expect(withAccount([account('u1'), account('u2')], account('u1'), true).map((a) => a.userId)).toEqual(['u2']);
  });
});
