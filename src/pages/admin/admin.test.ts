// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { disclaimerText } from '@/pages/Login';
import { parseWidths } from './Metadata';
import { hourLabel, ratingLevels } from './ParentalControls';

describe('ratingLevels', () => {
  const ratings = [
    { Name: 'Unrated' },
    { Name: 'R', Value: 17, RatingScore: { score: 17, subScore: 0 } },
    { Name: 'PG-13', Value: 13, RatingScore: { score: 13, subScore: 0 } },
    { Name: 'FSK-12', Value: 13, RatingScore: { score: 13, subScore: 0 } },
    { Name: 'TV-MA', Value: 17, RatingScore: { score: 17, subScore: 1 } },
  ];

  it('groups ratings that mean the same age and puts them in order', () => {
    expect(ratingLevels(ratings).map((l) => [l.key, l.label])).toEqual([
      ['13', 'PG-13 / FSK-12'],
      ['17', 'R'],
      ['17:1', 'TV-MA'],
    ]);
  });

  it('reads servers that only send a value', () => {
    expect(ratingLevels([{ Name: 'PG', Value: 10 }])).toEqual([{ key: '10', score: 10, subScore: null, label: 'PG' }]);
  });
});

describe('hourLabel', () => {
  it('writes half hours as a time of day', () => {
    expect(hourLabel(0)).toBe('00:00');
    expect(hourLabel(8.5)).toBe('08:30');
    expect(hourLabel(24)).toBe('24:00');
  });
});

describe('parseWidths', () => {
  it('keeps whole, positive widths', () => {
    expect(parseWidths('320, 480 720')).toEqual([320, 480, 720]);
    expect(parseWidths('320, wide, -5, 1.5,')).toEqual([320]);
  });
});

describe('disclaimerText', () => {
  it('drops markup and keeps the words', () => {
    expect(disclaimerText('<b>Private</b> server.<script>alert(1)</script>')).toBe('Private server.alert(1)');
    expect(disclaimerText(null)).toBe('');
  });
});
