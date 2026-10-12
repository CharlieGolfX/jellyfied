/**
 * Just enough of the Matroska container to pull one subtitle track out of a file without
 * downloading the file: the track list, the index (Cues), and single blocks by their position.
 * Used for VobSub subtitles, which the server can't hand out as a file of their own.
 */

/** Reads `length` bytes at `offset`. May return fewer at the end of the file. */
export type ReadBytes = (offset: number, length: number) => Promise<Uint8Array>;

const ID = {
  EBML: 0x1a45dfa3,
  Segment: 0x18538067,
  SeekHead: 0x114d9b74,
  Seek: 0x4dbb,
  SeekID: 0x53ab,
  SeekPosition: 0x53ac,
  Info: 0x1549a966,
  TimestampScale: 0x2ad7b1,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  CodecID: 0x86,
  CodecPrivate: 0x63a2,
  ContentEncodings: 0x6d80,
  ContentEncoding: 0x6240,
  ContentCompression: 0x5034,
  ContentCompAlgo: 0x4254,
  ContentCompSettings: 0x4255,
  ContentEncryption: 0x5035,
  Cues: 0x1c53bb6b,
  CuePoint: 0xbb,
  CueTime: 0xb3,
  CueTrackPositions: 0xb7,
  CueTrack: 0xf7,
  CueClusterPosition: 0xf1,
  CueRelativePosition: 0xf0,
  CueDuration: 0xb2,
  Cluster: 0x1f43b675,
  BlockGroup: 0xa0,
  Block: 0xa1,
  BlockDuration: 0x9b,
  SimpleBlock: 0xa3,
} as const;

const HEAD_BYTES = 64 * 1024;
const BLOCK_BYTES = 8 * 1024;
/** Larger than any real track list or index; guards against reading a broken size. */
const MAX_TRACKS_BYTES = 8 * 1024 * 1024;
const MAX_CUES_BYTES = 96 * 1024 * 1024;

interface Element {
  id: number;
  /** Bytes of content, or -1 when the file doesn't say (allowed for the outermost elements). */
  size: number;
  /** Where the content starts in the buffer the element was read from. */
  start: number;
}

/** Reads the element header at `pos`, or null when the buffer ends before the header does. */
export function readElement(buf: Uint8Array, pos: number): Element | null {
  if (pos >= buf.length) return null;
  const first = buf[pos];
  const idLength = Math.clz32(first) - 23;
  if (idLength > 4 || pos + idLength >= buf.length) return null;
  let id = 0;
  for (let i = 0; i < idLength; i++) id = id * 256 + buf[pos + i];
  const sizeAt = pos + idLength;
  const sizeLength = Math.clz32(buf[sizeAt]) - 23;
  if (sizeLength > 8 || sizeAt + sizeLength > buf.length) return null;
  let size = buf[sizeAt] & (0xff >> sizeLength);
  let unknown = size === 0xff >> sizeLength;
  for (let i = 1; i < sizeLength; i++) {
    unknown &&= buf[sizeAt + i] === 0xff;
    size = size * 256 + buf[sizeAt + i];
  }
  return { id, size: unknown ? -1 : size, start: sizeAt + sizeLength };
}

/** The elements directly inside buf[start, end) whose content lies fully inside it. */
function* children(buf: Uint8Array, start = 0, end = buf.length): Generator<Element> {
  let pos = start;
  while (pos < end) {
    const el = readElement(buf, pos);
    if (!el || el.size < 0 || el.start + el.size > end) return;
    yield el;
    pos = el.start + el.size;
  }
}

function uint(buf: Uint8Array, el: Element): number {
  let value = 0;
  for (let i = 0; i < el.size; i++) value = value * 256 + buf[el.start + i];
  return value;
}

const bytes = (buf: Uint8Array, el: Element) => buf.subarray(el.start, el.start + el.size);

export interface MatroskaTrack {
  /** The number blocks refer to the track by. */
  number: number;
  codecId: string;
  codecPrivate: Uint8Array | null;
  /** How the track's blocks are packed: as they are, zlib-compressed, or with these leading bytes removed. */
  packing: 'none' | 'zlib' | Uint8Array | 'unsupported';
}

export interface MatroskaCue {
  /** Seconds from the start of the file. */
  time: number;
  /** Seconds the block is shown for, when the index says. */
  duration: number | null;
  /** Where the block's cluster starts, counted from the start of the segment. */
  cluster: number;
  /** Where the block starts inside its cluster. */
  offset: number;
}

export interface MatroskaFile {
  /** The tracks in file order, which is the order the server numbers its streams in. */
  tracks: MatroskaTrack[];
  /** Index entries of one track, in time order. Empty when the index doesn't cover the track. */
  cues: (track: MatroskaTrack) => Promise<MatroskaCue[]>;
  /** The content of the block an index entry points at, unpacked. */
  block: (track: MatroskaTrack, cue: MatroskaCue) => Promise<Uint8Array>;
}

function parseTrack(buf: Uint8Array, entry: Element): MatroskaTrack {
  const track: MatroskaTrack = { number: 0, codecId: '', codecPrivate: null, packing: 'none' };
  for (const el of children(buf, entry.start, entry.start + entry.size)) {
    if (el.id === ID.TrackNumber) track.number = uint(buf, el);
    else if (el.id === ID.CodecID) track.codecId = new TextDecoder().decode(bytes(buf, el)).replace(/\0+$/, '');
    else if (el.id === ID.CodecPrivate) track.codecPrivate = bytes(buf, el).slice();
    else if (el.id === ID.ContentEncodings) {
      for (const encoding of children(buf, el.start, el.start + el.size)) {
        if (encoding.id !== ID.ContentEncoding) continue;
        // More than one encoding on a track is not something muxers write for subtitles.
        if (track.packing !== 'none') track.packing = 'unsupported';
        for (const part of children(buf, encoding.start, encoding.start + encoding.size)) {
          if (part.id === ID.ContentEncryption) track.packing = 'unsupported';
          if (part.id !== ID.ContentCompression || track.packing !== 'none') continue;
          // The algorithm defaults to zlib when it is left out.
          let algorithm = 0;
          let settings = new Uint8Array(0);
          for (const field of children(buf, part.start, part.start + part.size)) {
            if (field.id === ID.ContentCompAlgo) algorithm = uint(buf, field);
            else if (field.id === ID.ContentCompSettings) settings = bytes(buf, field).slice();
          }
          track.packing = algorithm === 0 ? 'zlib' : algorithm === 3 ? settings : 'unsupported';
        }
      }
    }
  }
  return track;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Opens a Matroska file through `read`. Throws when it isn't one, or lacks a track list or index. */
export async function openMatroska(read: ReadBytes): Promise<MatroskaFile> {
  const head = await read(0, HEAD_BYTES);
  const ebml = readElement(head, 0);
  if (!ebml || ebml.id !== ID.EBML || ebml.size < 0) throw new Error('Not a Matroska file');
  const segment = readElement(head, ebml.start + ebml.size);
  if (!segment || segment.id !== ID.Segment) throw new Error('Matroska file without a segment');
  const segmentStart = segment.start;

  // Where the parts are: either met while walking the start of the file, or listed in its SeekHead.
  const found = new Map<number, number>();
  for (let pos = segmentStart; ;) {
    const el = readElement(head, pos);
    if (!el || el.id === ID.Cluster) break;
    if (!found.has(el.id)) found.set(el.id, pos);
    if (el.id === ID.SeekHead && el.size >= 0 && el.start + el.size <= head.length) {
      for (const seek of children(head, el.start, el.start + el.size)) {
        if (seek.id !== ID.Seek) continue;
        let id = 0;
        let position = -1;
        for (const field of children(head, seek.start, seek.start + seek.size)) {
          if (field.id === ID.SeekID) id = uint(head, field);
          else if (field.id === ID.SeekPosition) position = uint(head, field);
        }
        if (id && position >= 0 && !found.has(id)) found.set(id, segmentStart + position);
      }
    }
    if (el.size < 0) break;
    pos = el.start + el.size;
  }

  /** Reads a whole top-level element, reusing the start of the file where it is in there. */
  const element = async (id: number, limit: number): Promise<Uint8Array | null> => {
    const at = found.get(id);
    if (at === undefined) return null;
    const header = at + 16 <= head.length ? head.subarray(at, at + 16) : await read(at, 16);
    const el = readElement(header, 0);
    if (!el || el.id !== id || el.size < 0 || el.size > limit) return null;
    if (at + el.start + el.size <= head.length) return head.subarray(at + el.start, at + el.start + el.size);
    const data = await read(at + el.start, el.size);
    return data.length === el.size ? data : null;
  };

  let timestampScale = 1_000_000;
  const info = await element(ID.Info, MAX_TRACKS_BYTES);
  if (info) for (const el of children(info)) if (el.id === ID.TimestampScale) timestampScale = uint(info, el) || timestampScale;
  const seconds = (ticks: number) => (ticks * timestampScale) / 1e9;

  const trackList = await element(ID.Tracks, MAX_TRACKS_BYTES);
  if (!trackList) throw new Error('Matroska file without a track list');
  const tracks: MatroskaTrack[] = [];
  for (const el of children(trackList)) if (el.id === ID.TrackEntry) tracks.push(parseTrack(trackList, el));

  let index: Promise<Uint8Array | null> | null = null;
  const cues = async (track: MatroskaTrack): Promise<MatroskaCue[]> => {
    const data = await (index ??= element(ID.Cues, MAX_CUES_BYTES));
    if (!data) return [];
    const list: MatroskaCue[] = [];
    for (const point of children(data)) {
      if (point.id !== ID.CuePoint) continue;
      let time = 0;
      const positions: Element[] = [];
      for (const el of children(data, point.start, point.start + point.size)) {
        if (el.id === ID.CueTime) time = uint(data, el);
        else if (el.id === ID.CueTrackPositions) positions.push(el);
      }
      for (const position of positions) {
        let number = 0;
        let cluster = -1;
        let offset = -1;
        let duration: number | null = null;
        for (const el of children(data, position.start, position.start + position.size)) {
          if (el.id === ID.CueTrack) number = uint(data, el);
          else if (el.id === ID.CueClusterPosition) cluster = uint(data, el);
          else if (el.id === ID.CueRelativePosition) offset = uint(data, el);
          else if (el.id === ID.CueDuration) duration = seconds(uint(data, el));
        }
        // Without the position inside the cluster, finding the block means downloading the cluster.
        if (number === track.number && cluster >= 0 && offset >= 0) list.push({ time: seconds(time), duration, cluster, offset });
      }
    }
    return list.sort((a, b) => a.time - b.time);
  };

  /** Where each cluster's content starts, by the cluster's position. */
  const clusters = new Map<number, Promise<number>>();
  const clusterContent = (position: number): Promise<number> => {
    let start = clusters.get(position);
    if (!start) {
      start = read(segmentStart + position, 12).then((header) => {
        const el = readElement(header, 0);
        if (!el || el.id !== ID.Cluster) throw new Error('Matroska index points outside a cluster');
        return segmentStart + position + el.start;
      });
      clusters.set(position, start);
      start.catch(() => clusters.delete(position));
    }
    return start;
  };

  const block = async (track: MatroskaTrack, cue: MatroskaCue): Promise<Uint8Array> => {
    const at = (await clusterContent(cue.cluster)) + cue.offset;
    let buf = await read(at, BLOCK_BYTES);
    const outer = readElement(buf, 0);
    if (!outer || outer.size < 0 || (outer.id !== ID.BlockGroup && outer.id !== ID.SimpleBlock)) {
      throw new Error('Matroska index does not point at a block');
    }
    const total = outer.start + outer.size;
    if (total > buf.length) buf = await read(at, total);
    if (total > buf.length) throw new Error('Matroska block is cut short');
    let inner: Element | undefined = outer;
    if (outer.id === ID.BlockGroup) {
      inner = undefined;
      for (const el of children(buf, outer.start, total)) if (el.id === ID.Block) inner = el;
    }
    if (!inner) throw new Error('Matroska block group without a block');
    // A block starts with its track number, a relative time (2 bytes) and flags (1 byte).
    const numberLength = Math.clz32(buf[inner.start]) - 23;
    let number = buf[inner.start] & (0xff >> numberLength);
    for (let i = 1; i < numberLength; i++) number = number * 256 + buf[inner.start + i];
    const flags = buf[inner.start + numberLength + 2];
    if (number !== track.number) throw new Error('Matroska index points at another track');
    if (flags & 0x06) throw new Error('Laced Matroska blocks are not supported');
    const frame = buf.subarray(inner.start + numberLength + 3, inner.start + inner.size);
    if (track.packing === 'unsupported') throw new Error('Matroska track is packed in an unsupported way');
    if (track.packing === 'zlib') return inflate(frame);
    if (track.packing === 'none' || track.packing.length === 0) return frame.slice();
    const whole = new Uint8Array(track.packing.length + frame.length);
    whole.set(track.packing);
    whole.set(frame, track.packing.length);
    return whole;
  };

  return { tracks, cues, block };
}
