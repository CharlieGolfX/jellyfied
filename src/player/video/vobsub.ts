import { openMatroska, type MatroskaCue, type ReadBytes } from './matroska';

/**
 * VobSub (DVD) subtitles: pictures of up to four colours, run-length encoded. In a Matroska file
 * the track's header holds the text of the .idx file (frame size and the 16-colour palette) and
 * each block is one subtitle picture with its own display instructions.
 */

export interface VobSubHeader {
  /** Size of the frame the pictures are placed in. Zero when the header doesn't say. */
  width: number;
  height: number;
  /** 16 colours as 0xRRGGBB. */
  palette: number[];
}

/** Used when a track has no palette of its own: black, white and greys. */
const DEFAULT_PALETTE = [
  0x000000, 0xffffff, 0x000000, 0x808080, 0xc0c0c0, 0x404040, 0xffffff, 0x000000, 0x808080, 0xc0c0c0, 0x404040, 0xffffff, 0x000000,
  0x808080, 0xc0c0c0, 0x404040,
];

/** Reads the frame size and palette out of the .idx text kept in the track header. */
export function parseVobSubHeader(text: string): VobSubHeader {
  const size = /^\s*size:\s*(\d+)\s*x\s*(\d+)/im.exec(text);
  const colours = (/^\s*palette:\s*(.+)$/im.exec(text)?.[1] ?? '')
    .split(',')
    .map((c) => parseInt(c.trim(), 16))
    .filter((c) => Number.isFinite(c));
  return {
    width: size ? Number(size[1]) : 0,
    height: size ? Number(size[2]) : 0,
    palette: DEFAULT_PALETTE.map((fallback, i) => colours[i] ?? fallback),
  };
}

export interface VobSubImage {
  /** Position of the picture in the frame. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Pixels, four bytes each: red, green, blue, opacity. */
  rgba: Uint8ClampedArray;
  /** Seconds after the block's own time that the picture appears. */
  start: number;
  /** Seconds after the block's own time that it goes away, when the picture says. */
  end: number | null;
}

/** Decodes one subtitle picture. Returns null for a block that holds no picture. */
export function decodeVobSub(packet: Uint8Array, palette: number[]): VobSubImage | null {
  const u16 = (at: number) => (at + 1 < packet.length ? (packet[at] << 8) | packet[at + 1] : 0);
  const length = Math.min(packet.length, u16(0) || packet.length);
  const instructions = u16(2);
  if (packet.length < 6 || instructions < 4 || instructions >= length) return null;

  // The display instructions: which four palette entries are used and how opaque each is, where
  // the picture goes, where its two interlaced fields start, and when it appears and goes away.
  let colours = [0, 1, 2, 3];
  let alpha = [0, 15, 15, 15];
  let x1 = 0;
  let x2 = -1;
  let y1 = 0;
  let y2 = -1;
  let fields: [number, number] | null = null;
  let start: number | null = null;
  let end: number | null = null;
  for (let sequence = instructions, guard = 0; guard < 64; guard++) {
    const when = (u16(sequence) * 1024) / 90000;
    const next = u16(sequence + 2);
    // Later instructions only fade or end the picture; its look is taken from when it appears.
    const applies = start === null || when === start;
    let p = sequence + 4;
    commands: while (p < length) {
      const command = packet[p++];
      switch (command) {
        case 0x00: // show, forced
        case 0x01: // show
          start ??= when;
          break;
        case 0x02: // hide
          end ??= when;
          break;
        case 0x03:
          if (applies) colours = [packet[p + 1] & 15, packet[p + 1] >> 4, packet[p] & 15, packet[p] >> 4];
          p += 2;
          break;
        case 0x04:
          if (applies) alpha = [packet[p + 1] & 15, packet[p + 1] >> 4, packet[p] & 15, packet[p] >> 4];
          p += 2;
          break;
        case 0x05:
          if (applies) {
            x1 = (packet[p] << 4) | (packet[p + 1] >> 4);
            x2 = ((packet[p + 1] & 15) << 8) | packet[p + 2];
            y1 = (packet[p + 3] << 4) | (packet[p + 4] >> 4);
            y2 = ((packet[p + 4] & 15) << 8) | packet[p + 5];
          }
          p += 6;
          break;
        case 0x06:
          if (applies) fields = [u16(p), u16(p + 2)];
          p += 4;
          break;
        case 0x07: // colour and contrast changes within the picture: skipped
          p += Math.max(2, u16(p));
          break;
        default: // 0xff ends the list
          break commands;
      }
    }
    if (next <= sequence || next >= length) break;
    sequence = next;
  }

  const width = x2 - x1 + 1;
  const height = y2 - y1 + 1;
  if (!fields || width <= 0 || height <= 0 || width > 4096 || height > 4096) return null;

  const rgba = new Uint8ClampedArray(width * height * 4);
  const shades = colours.map((index, i) => {
    const rgb = palette[index] ?? 0;
    return [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, alpha[i] * 17];
  });
  // Each field has every other line. Runs are counted in half bytes, and a line ends on a whole one.
  const at = [fields[0] * 2, fields[1] * 2];
  const limit = instructions * 2;
  for (let y = 0; y < height; y++) {
    let pos = at[y & 1];
    const nibble = () => {
      const value = pos < limit ? (packet[pos >> 1] >> (pos & 1 ? 0 : 4)) & 15 : 0;
      pos++;
      return value;
    };
    for (let x = 0; x < width;) {
      let code = 0;
      for (let threshold = 1; code < threshold && threshold <= 0x40; threshold <<= 2) code = (code << 4) | nibble();
      // A run of zero length fills the rest of the line.
      const run = code < 4 ? width - x : Math.min(code >> 2, width - x);
      const shade = shades[code & 3];
      if (shade[3]) {
        for (let i = (y * width + x) * 4, stop = i + run * 4; i < stop; i += 4) {
          rgba[i] = shade[0];
          rgba[i + 1] = shade[1];
          rgba[i + 2] = shade[2];
          rgba[i + 3] = shade[3];
        }
      }
      x += run;
    }
    at[y & 1] = (pos + 1) & ~1;
  }
  return { x: x1, y: y1, width, height, rgba, start: start ?? 0, end };
}

/** A subtitle picture and the seconds of the video it is shown for. */
export interface VobSubEvent {
  from: number;
  to: number;
  image: VobSubImage;
}

export interface VobSubTrack {
  header: VobSubHeader;
  /** The picture to show at this second of the video, if it has been fetched. */
  at: (seconds: number) => VobSubEvent | null;
  /** Fetches the pictures around this second of the video, if they aren't here yet. */
  prepare: (seconds: number) => void;
  close: () => void;
}

/** Longest a picture stays up when neither it nor the file says when it ends. */
const LONGEST_SECONDS = 10;
const AHEAD_SECONDS = 120;
const AHEAD_COUNT = 16;
const KEEP_COUNT = 160;

const isVobSubTrack = (codecId: string) => codecId === 'S_VOBSUB';

/**
 * Opens a VobSub track of a Matroska file. `streamIndex` is the server's number for the stream,
 * `position` its place among the file's VobSub tracks, for files whose numbering differs.
 * Throws when the track can't be read this way; the server then has to burn the subtitles in.
 */
export async function openVobSubTrack(read: ReadBytes, pick: { streamIndex: number; position: number }): Promise<VobSubTrack> {
  const file = await openMatroska(read);
  const byIndex = file.tracks[pick.streamIndex];
  const track = byIndex && isVobSubTrack(byIndex.codecId) ? byIndex : file.tracks.filter((t) => isVobSubTrack(t.codecId))[pick.position];
  if (!track) throw new Error('No VobSub track at that position');
  if (track.packing === 'unsupported') throw new Error('VobSub track is packed in an unsupported way');
  const header = parseVobSubHeader(new TextDecoder().decode(track.codecPrivate ?? new Uint8Array(0)));
  const cues: MatroskaCue[] = await file.cues(track);
  if (cues.length === 0) throw new Error("The file's index does not cover the VobSub track");

  /** Fetched pictures by index entry; null for one that holds no picture or failed. */
  const events = new Map<number, VobSubEvent | null>();
  const loading = new Set<number>();
  let closed = false;
  let now = 0;

  /** The last index entry at or before this second, or -1. */
  const entryAt = (seconds: number) => {
    let low = 0;
    let high = cues.length - 1;
    let hit = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (cues[mid].time <= seconds) {
        hit = mid;
        low = mid + 1;
      } else high = mid - 1;
    }
    return hit;
  };

  const fetchEvent = async (i: number): Promise<VobSubEvent | null> => {
    const cue = cues[i];
    const image = decodeVobSub(await file.block(track, cue), header.palette);
    if (!image) return null;
    const from = cue.time + image.start;
    const length = image.end !== null && image.end > image.start ? image.end - image.start : (cue.duration ?? LONGEST_SECONDS);
    // The next picture replaces this one.
    const next = cues[i + 1]?.time ?? Infinity;
    return { from, to: Math.min(from + Math.min(length, LONGEST_SECONDS * 6), Math.max(next, from)), image };
  };

  const pump = () => {
    if (closed) return;
    while (loading.size < 2) {
      let wanted = -1;
      for (let i = Math.max(0, entryAt(now)), n = 0; i < cues.length && n < AHEAD_COUNT && cues[i].time < now + AHEAD_SECONDS; i++, n++) {
        if (!events.has(i) && !loading.has(i)) {
          wanted = i;
          break;
        }
      }
      if (wanted < 0) return;
      const i = wanted;
      loading.add(i);
      fetchEvent(i)
        .catch((err: unknown) => {
          console.warn('Could not read a VobSub picture', err);
          return null;
        })
        .then((event) => {
          loading.delete(i);
          if (closed) return;
          events.set(i, event);
          if (events.size > KEEP_COUNT) {
            // Forget what is furthest from where the video is.
            const current = entryAt(now);
            const furthest = [...events.keys()].sort((a, b) => Math.abs(b - current) - Math.abs(a - current));
            for (const key of furthest.slice(0, events.size - KEEP_COUNT)) events.delete(key);
          }
          pump();
        });
    }
  };

  // Proves the track can be read before the player relies on it.
  events.set(0, await fetchEvent(0));

  return {
    header,
    at: (seconds) => {
      const event = events.get(entryAt(seconds));
      return event && seconds >= event.from && seconds < event.to ? event : null;
    },
    prepare: (seconds) => {
      now = seconds;
      pump();
    },
    close: () => {
      closed = true;
      events.clear();
    },
  };
}
