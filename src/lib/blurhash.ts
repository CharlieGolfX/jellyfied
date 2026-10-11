/**
 * BlurHash: a few characters that describe a blurred version of an image. Jellyfin sends one with
 * every image tag, and it is drawn in the card until the real image has loaded.
 * The format is described at https://github.com/woltapp/blurhash.
 */
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';

function decode83(text: string): number {
  let value = 0;
  for (const c of text) {
    const digit = ALPHABET.indexOf(c);
    if (digit < 0) return NaN;
    value = value * 83 + digit;
  }
  return value;
}

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (v: number) => {
  const c = Math.max(0, Math.min(1, v));
  return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255);
};
const signPow = (v: number, exp: number) => Math.sign(v) * Math.abs(v) ** exp;

/** The pixels (RGBA) of a hash at the given size, or null when the text is not a BlurHash. */
export function decodeBlurHash(hash: string, width: number, height: number): Uint8ClampedArray | null {
  if (hash.length < 6) return null;
  const size = decode83(hash[0]);
  const nx = (size % 9) + 1;
  const ny = Math.floor(size / 9) + 1;
  if (Number.isNaN(size) || hash.length !== 4 + 2 * nx * ny) return null;
  const maximum = (decode83(hash[1]) + 1) / 166;

  const colors: [number, number, number][] = [];
  for (let i = 0; i < nx * ny; i++) {
    if (i === 0) {
      const v = decode83(hash.slice(2, 6));
      if (Number.isNaN(v)) return null;
      colors.push([toLinear(v >> 16), toLinear((v >> 8) & 255), toLinear(v & 255)]);
    } else {
      const v = decode83(hash.slice(4 + i * 2, 6 + i * 2));
      if (Number.isNaN(v)) return null;
      colors.push([
        signPow((Math.floor(v / 361) - 9) / 9, 2) * maximum,
        signPow(((Math.floor(v / 19) % 19) - 9) / 9, 2) * maximum,
        signPow(((v % 19) - 9) / 9, 2) * maximum,
      ]);
    }
  }

  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let j = 0; j < ny; j++) {
        const cy = Math.cos((Math.PI * y * j) / height);
        for (let i = 0; i < nx; i++) {
          const basis = Math.cos((Math.PI * x * i) / width) * cy;
          const color = colors[i + j * nx];
          r += color[0] * basis;
          g += color[1] * basis;
          b += color[2] * basis;
        }
      }
      const at = 4 * (x + y * width);
      pixels[at] = toSrgb(r);
      pixels[at + 1] = toSrgb(g);
      pixels[at + 2] = toSrgb(b);
      pixels[at + 3] = 255;
    }
  }
  return pixels;
}

const SIZE = 24;
const cache = new Map<string, string | null>();

/** A small image of the hash as a data: address, for an <img>. Null when it can't be drawn. */
export function blurHashImage(hash: string | null | undefined): string | null {
  if (!hash) return null;
  const known = cache.get(hash);
  if (known !== undefined) return known;
  let url: string | null = null;
  try {
    const pixels = decodeBlurHash(hash, SIZE, SIZE);
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const context = pixels && canvas.getContext('2d');
    if (pixels && context) {
      const data = context.createImageData(SIZE, SIZE);
      data.data.set(pixels);
      context.putImageData(data, 0, 0);
      url = canvas.toDataURL('image/png');
    }
  } catch {
    url = null;
  }
  // Enough for a long scroll through a library; the oldest go first.
  if (cache.size >= 2000) cache.delete(cache.keys().next().value!);
  cache.set(hash, url);
  return url;
}
