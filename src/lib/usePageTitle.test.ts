import { describe, expect, it } from 'vitest';
import { pageTitle } from './usePageTitle';

describe('pageTitle', () => {
  it('puts the page before the app name', () => {
    expect(pageTitle('Dune')).toBe('Dune · Jellyfied');
  });

  it('is just the app name without a page', () => {
    expect(pageTitle(undefined)).toBe('Jellyfied');
    expect(pageTitle('  ')).toBe('Jellyfied');
  });
});
