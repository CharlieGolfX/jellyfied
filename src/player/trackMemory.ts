import type { MediaStream } from '@/api/types';
import { prefChanged } from '@/lib/prefsBus';

/**
 * Remembers the audio and subtitle track chosen for a show, so the next episode starts with the
 * same choice. Episodes number their tracks differently, so a track is remembered by what it is
 * (language, title, …) rather than by its index. Synced with the account (see prefsSync).
 */
interface TrackSignature {
  language?: string;
  title?: string;
  displayTitle?: string;
  codec?: string;
  channels?: number;
  forced?: boolean;
}

interface SeriesMemory {
  audio?: TrackSignature;
  /** 'off' = subtitles were turned off. */
  subtitle?: TrackSignature | 'off';
}

const KEY = 'jellyfied.trackMemory';
/** Shows kept; the least recently changed ones are dropped first. */
const MAX_SERIES = 300;

function readAll(): Record<string, SeriesMemory> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return raw && typeof raw === 'object' ? (raw as Record<string, SeriesMemory>) : {};
  } catch {
    return {};
  }
}

function update(seriesId: string, patch: SeriesMemory) {
  const all = readAll();
  const entry = { ...all[seriesId], ...patch };
  // Re-insert so the object's key order doubles as "least recently changed first".
  delete all[seriesId];
  all[seriesId] = entry;
  const ids = Object.keys(all);
  for (const id of ids.slice(0, Math.max(0, ids.length - MAX_SERIES))) delete all[id];
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
  prefChanged(KEY);
}

function signature(s: MediaStream): TrackSignature {
  return {
    language: s.Language || undefined,
    title: s.Title || undefined,
    displayTitle: s.DisplayTitle || undefined,
    codec: s.Codec || undefined,
    channels: s.Channels ?? undefined,
    forced: s.IsForced || undefined,
  };
}

export function rememberAudioTrack(seriesId: string, stream: MediaStream | undefined) {
  if (stream) update(seriesId, { audio: signature(stream) });
}

/** Pass undefined when subtitles were turned off. */
export function rememberSubtitleTrack(seriesId: string, stream: MediaStream | undefined) {
  update(seriesId, { subtitle: stream ? signature(stream) : 'off' });
}

/** The stream that best matches a remembered track, or undefined when none is close enough. */
function match(streams: MediaStream[], sig: TrackSignature): MediaStream | undefined {
  let best: MediaStream | undefined;
  let bestScore = 0;
  for (const s of streams) {
    // A different language is never the same track.
    if ((s.Language || undefined) !== sig.language) continue;
    let score = sig.language ? 8 : 0;
    if (sig.title && s.Title === sig.title) score += 4;
    if (sig.displayTitle && s.DisplayTitle === sig.displayTitle) score += 2;
    if (Boolean(s.IsForced) === Boolean(sig.forced)) score += 2;
    if (sig.codec && s.Codec === sig.codec) score += 1;
    if (sig.channels && s.Channels === sig.channels) score += 1;
    // Without a language to go by, the title has to match.
    if (!sig.language && score < 4) continue;
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Stream indexes to start an episode with. A field is undefined when nothing was remembered or
 * no track of this episode matches, in which case the server's default applies. subtitleIndex -1
 * means subtitles off.
 */
export function recallTracks(
  seriesId: string | null | undefined,
  streams: MediaStream[] | null | undefined,
  enabled: { audio: boolean; subtitle: boolean },
): { audioIndex?: number; subtitleIndex?: number } {
  if (!seriesId || !streams) return {};
  const memory = readAll()[seriesId];
  if (!memory) return {};
  const result: { audioIndex?: number; subtitleIndex?: number } = {};
  if (enabled.audio && memory.audio) {
    result.audioIndex = match(
      streams.filter((s) => s.Type === 'Audio'),
      memory.audio,
    )?.Index;
  }
  if (enabled.subtitle && memory.subtitle) {
    result.subtitleIndex =
      memory.subtitle === 'off'
        ? -1
        : match(
            streams.filter((s) => s.Type === 'Subtitle'),
            memory.subtitle,
          )?.Index;
  }
  return result;
}
