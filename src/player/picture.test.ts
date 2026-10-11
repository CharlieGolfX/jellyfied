import { describe, expect, it } from 'vitest';
import { pictureStyle } from './picture';

const box = { width: 1600, height: 900 };
const wide = { width: 2400, height: 1000 }; // 2.4:1

describe('pictureStyle', () => {
  it('leaves the normal case to CSS', () => {
    expect(pictureStyle({ fit: 'fit', aspect: 'auto', zoom: 1, box, video: wide })).toBeUndefined();
  });

  it('waits for the player size', () => {
    expect(pictureStyle({ fit: 'fill', aspect: 'auto', zoom: 1, box: { width: 0, height: 0 }, video: wide })).toBeUndefined();
  });

  it('fills the player by cropping the sides of a wide picture', () => {
    const style = pictureStyle({ fit: 'fill', aspect: 'auto', zoom: 1, box, video: wide })!;
    expect(style.height).toBeCloseTo(900);
    expect(style.width).toBeCloseTo(2160);
    expect(style.left).toBeCloseTo(-280);
    expect(style.top).toBeCloseTo(0);
  });

  it('stretches to exactly the player', () => {
    expect(pictureStyle({ fit: 'stretch', aspect: '4:3', zoom: 1, box, video: wide })).toMatchObject({ width: 1600, height: 900, left: 0, top: 0 });
  });

  it('forces an aspect ratio inside the player', () => {
    const style = pictureStyle({ fit: 'fit', aspect: '4:3', zoom: 1, box, video: wide })!;
    expect(style.width).toBeCloseTo(1200);
    expect(style.height).toBeCloseTo(900);
    expect(style.left).toBeCloseTo(200);
  });

  it('zooms around the centre', () => {
    const style = pictureStyle({ fit: 'fit', aspect: '16:9', zoom: 2, box, video: wide })!;
    expect(style).toMatchObject({ width: 3200, height: 1800, left: -800, top: -450 });
  });

  it('assumes 16:9 until the video size is known', () => {
    const style = pictureStyle({ fit: 'fit', aspect: 'auto', zoom: 1.5, box, video: { width: 0, height: 0 } })!;
    expect(style.width).toBeCloseTo(2400);
    expect(style.height).toBeCloseTo(1350);
  });
});
