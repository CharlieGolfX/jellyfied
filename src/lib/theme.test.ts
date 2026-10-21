import { describe, expect, it } from 'vitest';
import { ACCENT_PRESETS, accentColors } from './theme';

const luminance = (hex: string) => {
  const c = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(1) + 0.7152 * c(3) + 0.0722 * c(5);
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('accentColors', () => {
  it('deepens the default blue just enough for white text', () => {
    expect(accentColors('#00a4dc')).toEqual({ fill: '#007ea9', hover: expect.any(String), ink: '#ffffff' });
  });

  it('keeps a light amber as it is, with dark text, instead of turning it brown', () => {
    expect(accentColors('#e5a00d')).toEqual({ fill: '#e5a00d', hover: expect.any(String), ink: '#101010' });
  });

  it('gives every preset text that reaches 4.5:1', () => {
    for (const { value } of ACCENT_PRESETS) {
      const { fill, ink } = accentColors(value);
      expect(contrast(fill, ink)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('leaves a dark accent alone', () => {
    expect(accentColors('#0b5394')).toMatchObject({ fill: '#0b5394', ink: '#ffffff' });
  });
});
