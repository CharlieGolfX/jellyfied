// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { openMatroska, readElement } from './matroska';
import { decodeVobSub, openVobSubTrack, parseVobSubHeader } from './vobsub';

// ---- Writing test data -----------------------------------------------------

const join = (...parts: (Uint8Array | number[])[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const text = (s: string) => new TextEncoder().encode(s);
const uint = (value: number, length = 8) => Array.from({ length }, (_, i) => Math.floor(value / 256 ** (length - 1 - i)) % 256);
const idBytes = (id: number) => uint(id, id > 0xffffff ? 4 : id > 0xffff ? 3 : id > 0xff ? 2 : 1);
/** A Matroska element with an 8-byte size, so sizes never change where things are. */
const el = (id: number, ...content: (Uint8Array | number[])[]) => {
  const body = join(...content);
  return join(idBytes(id), [0x01], uint(body.length, 7), body);
};

/** Wraps data as a zlib stream, without compressing it. */
function zlib(data: Uint8Array): Uint8Array {
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  const length = data.length;
  return join([0x78, 0x01, 0x01, length & 255, length >> 8, ~length & 255, (~length >> 8) & 255], data, uint(b * 65536 + a, 4));
}

/** Encodes a picture of pixel values 0–3 as a DVD subtitle that shows from `start` for `seconds`. */
function encodeVobSub(rows: number[][], at: { x: number; y: number }, seconds: number): Uint8Array {
  const field = (lines: number[][]) => {
    const nibbles: number[] = [];
    for (const line of lines) {
      for (let x = 0; x < line.length;) {
        let run = 1;
        while (x + run < line.length && line[x + run] === line[x]) run++;
        if (x + run === line.length && run > 3) nibbles.push(0, 0, 0, line[x]);
        else {
          run = Math.min(run, 255);
          const code = (run << 2) | line[x];
          if (code < 16) nibbles.push(code);
          else if (code < 64) nibbles.push(code >> 4, code & 15);
          else if (code < 256) nibbles.push(0, code >> 4, code & 15);
          else nibbles.push(0, code >> 8, (code >> 4) & 15, code & 15);
        }
        x += run;
      }
      if (nibbles.length % 2) nibbles.push(0);
    }
    return Array.from({ length: nibbles.length / 2 }, (_, i) => (nibbles[i * 2] << 4) | nibbles[i * 2 + 1]);
  };
  const top = field(rows.filter((_, i) => i % 2 === 0));
  const bottom = field(rows.filter((_, i) => i % 2 === 1));
  const instructions = 4 + top.length + bottom.length;
  const x2 = at.x + rows[0].length - 1;
  const y2 = at.y + rows.length - 1;
  const first = [
    ...uint(0, 2),
    ...uint(instructions + 24, 2),
    0x03,
    0x32, // pixel values 3, 2 → palette entries 3, 2
    0x10, // pixel values 1, 0 → palette entries 1, 0
    0x04,
    0xf8, // opacity of 3, 2
    0xf0, // opacity of 1, 0
    0x05,
    at.x >> 4,
    ((at.x & 15) << 4) | (x2 >> 8),
    x2 & 255,
    at.y >> 4,
    ((at.y & 15) << 4) | (y2 >> 8),
    y2 & 255,
    0x06,
    ...uint(4, 2),
    ...uint(4 + top.length, 2),
    0x01,
    0xff,
  ];
  const second = [...uint(Math.round((seconds * 90000) / 1024), 2), ...uint(instructions + 24, 2), 0x02, 0xff];
  const body = join(top, bottom, first, second);
  return join(uint(4 + body.length, 2), uint(instructions, 2), body);
}

const PICTURE = [
  [0, 0, 1, 1, 1, 1, 0, 0],
  [0, 1, 2, 2, 2, 2, 1, 0],
  [3, 3, 3, 3, 3, 3, 3, 3],
  [0, 1, 0, 1, 0, 1, 0, 1],
  [2, 2, 2, 2, 2, 2, 2, 2],
];
const IDX =
  'size: 720x576\npalette: 000000, ff0000, 00ff00, 0000ff, ffffff, 000000, 000000, 000000, 000000, 000000, 000000, 000000, 000000, 000000, 000000, 000000\n';

/**
 * A Matroska file with a video track and a VobSub track. The subtitle shows at 2 s and at 65.5 s;
 * the video blocks between them are large, so reading the whole file would be noticed.
 */
function buildFile(packing: 'none' | 'zlib' | 'strip' = 'none') {
  const pack = (packet: Uint8Array) => (packing === 'zlib' ? zlib(packet) : packing === 'strip' ? packet.subarray(2) : packet);
  const subtitle = (seconds: number) => encodeVobSub(PICTURE, { x: 100, y: 400 }, seconds);
  // Both pictures are the same size, so the bytes removed by 'strip' are the same for both.
  const stripped = subtitle(3).subarray(0, 2);
  const encodings =
    packing === 'none'
      ? []
      : [el(0x6d80, el(0x6240, el(0x5034, packing === 'zlib' ? el(0x4254, [0]) : join(el(0x4254, [3]), el(0x4255, stripped)))))];
  const tracks = el(
    0x1654ae6b,
    el(0xae, el(0xd7, [1]), el(0x86, text('V_MPEG4/ISO/AVC'))),
    el(0xae, el(0xd7, [2]), el(0x86, text('S_VOBSUB')), el(0x63a2, text(IDX)), ...encodings),
  );
  const info = el(0x1549a966, el(0x2ad7b1, uint(1_000_000, 4)));
  const video = () => el(0xa3, [0x81, 0, 0, 0x80], new Uint8Array(400_000));
  const cluster = (ms: number, packet: Uint8Array, durationMs: number) => {
    const before = join(el(0xe7, uint(ms, 4)), video());
    const group = el(0xa0, el(0xa1, [0x82, 0, 0, 0], pack(packet)), el(0x9b, uint(durationMs, 2)));
    return { bytes: el(0x1f43b675, before, group, video()), offset: before.length };
  };
  const clusters = [cluster(2000, subtitle(3), 3000), cluster(65_500, subtitle(1.5), 1500)];
  const seekEntry = (id: number, position: number) => el(0x4dbb, el(0x53ab, idBytes(id)), el(0x53ac, uint(position)));
  const seekLength = el(0x114d9b74, seekEntry(0x1654ae6b, 0), seekEntry(0x1c53bb6b, 0), seekEntry(0x1549a966, 0)).length;
  const infoAt = seekLength;
  const tracksAt = infoAt + info.length;
  const clusterAt = [tracksAt + tracks.length, tracksAt + tracks.length + clusters[0].bytes.length];
  const cuesAt = clusterAt[1] + clusters[1].bytes.length;
  const cuePoint = (ms: number, i: number, durationMs: number) =>
    el(
      0xbb,
      el(0xb3, uint(ms, 4)),
      // The video track is indexed too, without a position inside the cluster.
      el(0xb7, el(0xf7, [1]), el(0xf1, uint(clusterAt[i]))),
      el(0xb7, el(0xf7, [2]), el(0xf1, uint(clusterAt[i])), el(0xf0, uint(clusters[i].offset)), el(0xb2, uint(durationMs, 2))),
    );
  const cues = el(0x1c53bb6b, cuePoint(2000, 0, 3000), cuePoint(65_500, 1, 1500));
  const seekHead = el(0x114d9b74, seekEntry(0x1654ae6b, tracksAt), seekEntry(0x1c53bb6b, cuesAt), seekEntry(0x1549a966, infoAt));
  const file = join(
    el(0x1a45dfa3, el(0x4282, text('matroska'))),
    el(0x18538067, seekHead, info, tracks, clusters[0].bytes, clusters[1].bytes, cues),
  );
  let fetched = 0;
  const read = (offset: number, length: number) => {
    fetched += Math.min(length, file.length - offset);
    return Promise.resolve(file.slice(offset, offset + length));
  };
  return { file, read, fetched: () => fetched };
}

// ---- Tests -----------------------------------------------------------------

describe('parseVobSubHeader', () => {
  it('reads the frame size and the palette', () => {
    const header = parseVobSubHeader(IDX);
    expect(header).toMatchObject({ width: 720, height: 576 });
    expect(header.palette.slice(0, 5)).toEqual([0x000000, 0xff0000, 0x00ff00, 0x0000ff, 0xffffff]);
    expect(header.palette).toHaveLength(16);
  });

  it('falls back to a black-and-white palette when the track has none', () => {
    const header = parseVobSubHeader('# VobSub index file, v7\n');
    expect(header).toMatchObject({ width: 0, height: 0 });
    expect(header.palette).toHaveLength(16);
    expect(header.palette[1]).toBe(0xffffff);
  });
});

describe('decodeVobSub', () => {
  const palette = parseVobSubHeader(IDX).palette;

  it('decodes position, timing and every pixel of a picture', () => {
    const image = decodeVobSub(encodeVobSub(PICTURE, { x: 100, y: 400 }, 3), palette)!;
    expect(image).toMatchObject({ x: 100, y: 400, width: 8, height: 5, start: 0 });
    expect(image.end).toBeCloseTo(3, 1);
    const pixel = (x: number, y: number) => Array.from(image.rgba.subarray((y * 8 + x) * 4, (y * 8 + x) * 4 + 4));
    // Pixel value 0 is fully transparent, 1 is red, 2 is green at reduced opacity, 3 is blue.
    for (let y = 0; y < PICTURE.length; y++) {
      for (let x = 0; x < 8; x++) {
        expect(pixel(x, y)).toEqual(
          [
            [0, 0, 0, 0],
            [255, 0, 0, 255],
            [0, 255, 0, 136],
            [0, 0, 255, 255],
          ][PICTURE[y][x]],
        );
      }
    }
  });

  it('copes with long runs and wide pictures', () => {
    const rows = [Array.from({ length: 700 }, (_, x) => (x < 300 ? 1 : x < 310 ? 2 : 3)), Array.from({ length: 700 }, () => 0)];
    const image = decodeVobSub(encodeVobSub(rows, { x: 10, y: 20 }, 1), palette)!;
    expect(image).toMatchObject({ x: 10, y: 20, width: 700, height: 2 });
    expect(image.rgba[299 * 4]).toBe(255);
    expect(image.rgba[305 * 4 + 1]).toBe(255);
    expect(image.rgba[699 * 4 + 2]).toBe(255);
    expect(image.rgba[(700 + 350) * 4 + 3]).toBe(0);
  });

  it('returns nothing for data that is not a picture', () => {
    expect(decodeVobSub(new Uint8Array(3), palette)).toBeNull();
    expect(decodeVobSub(new Uint8Array([0, 8, 0, 4, 0, 0, 0, 4, 0xff]), palette)).toBeNull();
    expect(decodeVobSub(new Uint8Array(64).fill(0xff), palette)).toBeNull();
  });
});

describe('reading a Matroska file', () => {
  it('reads element headers, including sizes left open', () => {
    expect(readElement(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x84, 1, 2, 3, 4]), 0)).toEqual({ id: 0x1a45dfa3, size: 4, start: 5 });
    expect(readElement(new Uint8Array([0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), 0)).toMatchObject({
      size: -1,
      start: 12,
    });
    expect(readElement(new Uint8Array([0x1a, 0x45]), 0)).toBeNull();
  });

  it('lists the tracks in file order and indexes only what can be found without the cluster', async () => {
    const { read } = buildFile();
    const file = await openMatroska(read);
    expect(file.tracks.map((t) => t.codecId)).toEqual(['V_MPEG4/ISO/AVC', 'S_VOBSUB']);
    expect(await file.cues(file.tracks[0])).toEqual([]);
    expect((await file.cues(file.tracks[1])).map((c) => [c.time, c.duration])).toEqual([
      [2, 3],
      [65.5, 1.5],
    ]);
  });

  it('refuses a file that is something else', async () => {
    await expect(openMatroska(() => Promise.resolve(text('WEBVTT\n\n00:01.000 --> 00:02.000\nHello')))).rejects.toThrow();
  });
});

describe('openVobSubTrack', () => {
  for (const packing of ['none', 'zlib', 'strip'] as const) {
    it(`shows each picture at its time without fetching the video (${packing})`, async () => {
      const { file, read, fetched } = buildFile(packing);
      const track = await openVobSubTrack(read, { streamIndex: 1, position: 0 });
      expect(track.header).toMatchObject({ width: 720, height: 576 });
      expect(track.at(1.9)).toBeNull();
      expect(track.at(2.5)?.image).toMatchObject({ x: 100, y: 400, width: 8, height: 5 });
      expect(track.at(2.5)).toMatchObject({ from: 2 });
      expect(track.at(5.2)).toBeNull();

      // Nothing from further on is here until the video gets near it.
      expect(track.at(66)).toBeNull();
      track.prepare(60);
      await expect.poll(() => track.at(66)).not.toBeNull();
      expect(track.at(66)!.to).toBeCloseTo(67, 1);
      expect(track.at(67.2)).toBeNull();
      expect(fetched()).toBeLessThan(file.length / 10);
      track.close();
    });
  }

  it("finds the track by its place among the VobSub tracks when the server's number is off", async () => {
    const track = await openVobSubTrack(buildFile().read, { streamIndex: 0, position: 0 });
    expect(track.at(2.5)).not.toBeNull();
  });

  it('gives up when there is no such track', async () => {
    await expect(openVobSubTrack(buildFile().read, { streamIndex: 0, position: 1 })).rejects.toThrow();
  });
});
