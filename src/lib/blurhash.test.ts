import { describe, expect, it } from 'vitest';
import { decodeBlurHash } from './blurhash';

describe('decodeBlurHash', () => {
  it('draws a hash with one component as one flat colour', () => {
    // "00" = 1×1 components, then the average colour #ff8000 in base 83.
    const value = (0xff << 16) | (0x80 << 8);
    const digits = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';
    let text = '';
    for (let v = value, i = 0; i < 4; i++, v = Math.floor(v / 83)) text = digits[v % 83] + text;
    const pixels = decodeBlurHash(`00${text}`, 2, 2)!;
    expect(Array.from(pixels.slice(0, 4))).toEqual([255, 128, 0, 255]);
    expect(Array.from(pixels.slice(12, 16))).toEqual([255, 128, 0, 255]);
  });

  it('decodes a hash with several components to opaque pixels that differ across the image', () => {
    // The example from the BlurHash project: 4×3 components.
    const pixels = decodeBlurHash('LEHV6nWB2yk8pyo0adR*.7kCMdnj', 8, 6)!;
    expect(pixels).toHaveLength(8 * 6 * 4);
    expect(pixels.filter((_, i) => i % 4 === 3).every((a) => a === 255)).toBe(true);
    expect(Array.from(pixels.slice(0, 3))).not.toEqual(Array.from(pixels.slice(-4, -1)));
  });

  it('refuses text that is not a hash', () => {
    expect(decodeBlurHash('', 4, 4)).toBeNull();
    expect(decodeBlurHash('not a hash!', 4, 4)).toBeNull();
    expect(decodeBlurHash('LEHV6nWB2yk8pyo0adR*.7kCMdn', 4, 4)).toBeNull();
  });
});
