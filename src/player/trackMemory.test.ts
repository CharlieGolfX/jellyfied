import { beforeEach, describe, expect, it } from 'vitest';
import type { MediaStream } from '@/api/types';
import { recallTracks, rememberAudioTrack, rememberSubtitleTrack } from './trackMemory';

const audio = (Index: number, Language: string, extra: Partial<MediaStream> = {}): MediaStream => ({
  Type: 'Audio',
  Index,
  Language,
  ...extra,
});
const sub = (Index: number, Language: string, extra: Partial<MediaStream> = {}): MediaStream => ({
  Type: 'Subtitle',
  Index,
  Language,
  ...extra,
});
const both = { audio: true, subtitle: true };

beforeEach(() => localStorage.clear());

describe('track memory', () => {
  it('recalls nothing for a show that was never changed', () => {
    expect(recallTracks('show', [audio(1, 'eng')], both)).toEqual({});
    expect(recallTracks(undefined, [audio(1, 'eng')], both)).toEqual({});
    expect(recallTracks('show', undefined, both)).toEqual({});
  });

  it('finds the same language at a different index in the next episode', () => {
    rememberAudioTrack('show', audio(1, 'jpn'));
    rememberSubtitleTrack('show', sub(3, 'eng'));
    const next = [audio(1, 'eng'), audio(2, 'jpn'), sub(3, 'spa'), sub(4, 'eng')];
    expect(recallTracks('show', next, both)).toEqual({ audioIndex: 2, subtitleIndex: 4 });
  });

  it('leaves the choice to the server when the language is missing from the episode', () => {
    rememberAudioTrack('show', audio(1, 'jpn'));
    expect(recallTracks('show', [audio(1, 'eng'), audio(2, 'fre')], both).audioIndex).toBeUndefined();
  });

  it('tells apart tracks of one language by title and forced flag', () => {
    rememberSubtitleTrack('show', sub(5, 'eng', { Title: 'Signs & Songs', IsForced: true }));
    const next = [sub(2, 'eng', { Title: 'Full' }), sub(3, 'eng', { Title: 'Signs & Songs', IsForced: true })];
    expect(recallTracks('show', next, both).subtitleIndex).toBe(3);
  });

  it('prefers the same channel layout and codec among otherwise equal tracks', () => {
    rememberAudioTrack('show', audio(1, 'eng', { Codec: 'eac3', Channels: 6 }));
    const next = [audio(1, 'eng', { Codec: 'aac', Channels: 2 }), audio(2, 'eng', { Codec: 'eac3', Channels: 6 })];
    expect(recallTracks('show', next, both).audioIndex).toBe(2);
  });

  it('needs a matching title when the track has no language', () => {
    rememberAudioTrack('show', { Type: 'Audio', Index: 1, Title: 'Commentary' });
    expect(
      recallTracks(
        'show',
        [
          { Type: 'Audio', Index: 1 },
          { Type: 'Audio', Index: 2, Title: 'Commentary' },
        ],
        both,
      ).audioIndex,
    ).toBe(2);
    expect(
      recallTracks(
        'show',
        [
          { Type: 'Audio', Index: 1 },
          { Type: 'Audio', Index: 2, Title: 'Other' },
        ],
        both,
      ).audioIndex,
    ).toBeUndefined();
  });

  it('remembers that subtitles were turned off', () => {
    rememberSubtitleTrack('show', sub(2, 'eng'));
    rememberSubtitleTrack('show', undefined);
    expect(recallTracks('show', [sub(2, 'eng')], both).subtitleIndex).toBe(-1);
  });

  it('keeps audio and subtitle choices apart, and shows apart', () => {
    rememberAudioTrack('a', audio(1, 'jpn'));
    rememberSubtitleTrack('a', sub(2, 'eng'));
    rememberAudioTrack('b', audio(1, 'eng'));
    const streams = [audio(1, 'eng'), audio(2, 'jpn'), sub(3, 'eng')];
    expect(recallTracks('a', streams, both)).toEqual({ audioIndex: 2, subtitleIndex: 3 });
    expect(recallTracks('b', streams, both)).toEqual({ audioIndex: 1 });
  });

  it('follows the account settings that turn remembering off', () => {
    rememberAudioTrack('show', audio(1, 'jpn'));
    rememberSubtitleTrack('show', sub(2, 'eng'));
    const streams = [audio(1, 'jpn'), sub(2, 'eng')];
    expect(recallTracks('show', streams, { audio: false, subtitle: true })).toEqual({ subtitleIndex: 2 });
    expect(recallTracks('show', streams, { audio: true, subtitle: false })).toEqual({ audioIndex: 1 });
  });

  it('drops the shows changed longest ago once there are more than 300', () => {
    for (let i = 0; i <= 300; i++) rememberAudioTrack(`show-${i}`, audio(1, 'jpn'));
    const streams = [audio(1, 'jpn')];
    expect(recallTracks('show-0', streams, both)).toEqual({});
    expect(recallTracks('show-1', streams, both)).toEqual({ audioIndex: 1 });
    expect(recallTracks('show-300', streams, both)).toEqual({ audioIndex: 1 });
  });

  it('survives unreadable stored data', () => {
    localStorage.setItem('jellyfied.trackMemory', '{not json');
    expect(recallTracks('show', [audio(1, 'eng')], both)).toEqual({});
    rememberAudioTrack('show', audio(1, 'eng'));
    expect(recallTracks('show', [audio(4, 'eng')], both)).toEqual({ audioIndex: 4 });
  });
});
