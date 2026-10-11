import { describe, expect, it } from 'vitest';
import { castServerAddress, isLocalOnlyAddress, parseCastMessage } from './chromecast';

describe('parseCastMessage', () => {
  it('reads what the receiver reports about playback', () => {
    const message = parseCastMessage(
      JSON.stringify({ type: 'playbackprogress', data: { NowPlayingItem: { Id: 'a', Name: 'Film' }, PlayState: { PositionTicks: 50, IsPaused: true } } }),
    );
    expect(message).toMatchObject({ type: 'playbackprogress', item: { Id: 'a' }, playState: { PositionTicks: 50, IsPaused: true } });
  });

  it('accepts messages without data', () => {
    expect(parseCastMessage('{"type":"playbackstop"}')).toEqual({ type: 'playbackstop', item: undefined, playState: undefined });
  });

  it('ignores anything that is not a receiver message', () => {
    expect(parseCastMessage('not json')).toBeNull();
    expect(parseCastMessage('{"data":{}}')).toBeNull();
    expect(parseCastMessage('null')).toBeNull();
  });
});

describe('castServerAddress', () => {
  it('turns the proxy path into a full address the Chromecast can open', () => {
    expect(castServerAddress('/jellyfin')).toBe(`${window.location.origin}/jellyfin`);
  });

  it('keeps a full address, without a trailing slash', () => {
    expect(castServerAddress('https://media.example.com/jf/')).toBe('https://media.example.com/jf');
  });
});

describe('isLocalOnlyAddress', () => {
  it('spots addresses only this computer can open', () => {
    expect(isLocalOnlyAddress('http://localhost:8080/jellyfin')).toBe(true);
    expect(isLocalOnlyAddress('http://127.0.0.1:8096')).toBe(true);
    expect(isLocalOnlyAddress('http://[::1]:8096')).toBe(true);
  });

  it('lets network addresses through', () => {
    expect(isLocalOnlyAddress('http://192.168.1.10:8096')).toBe(false);
    expect(isLocalOnlyAddress('https://media.example.com')).toBe(false);
  });
});
