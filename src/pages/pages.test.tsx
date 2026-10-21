import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, type FakeServer } from '@/test/renderPage';
import FavoritesPage from './Favorites';
import HomePage from './Home';
import SearchPage from './Search';
import SettingsPage from './Settings';
import StatsPage from './Stats';

/** The main pages render against a small server without crashing. */

const me = { Id: 'user-1', Name: 'demo', Policy: { IsAdministrator: false }, Configuration: { OrderedViews: [], SubtitleMode: 'Default' } };
const library = { Id: 'lib-movies', Name: 'Movies', Type: 'CollectionFolder', CollectionType: 'movies', IsFolder: true };
const movie = {
  Id: 'movie-1',
  Name: 'The Mock Movie',
  Type: 'Movie',
  MediaType: 'Video',
  ProductionYear: 2020,
  UserData: { Played: false, IsFavorite: true, PlaybackPositionTicks: 0 },
};
const list = (xs: unknown[]) => ({ Items: xs, TotalRecordCount: xs.length, StartIndex: 0 });

const server: FakeServer = (path, init, url) => {
  if (init?.method && init.method !== 'GET') return null;
  if (path === '/Users/Me') return me;
  if (path === '/UserViews') return list([library]);
  if (path === '/Items/Latest') return [movie];
  if (path === '/Items' && (url.searchParams.get('searchTerm') || url.searchParams.get('isFavorite') || url.searchParams.get('filters')))
    return list([movie]);
  if (path.startsWith('/DisplayPreferences')) return { CustomPrefs: {} };
  if (path === '/Sessions' || path === '/Localization/Cultures') return [];
  return list([]);
};

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('pages', () => {
  it('home shows the latest in each library', async () => {
    const page = await renderPage(<HomePage />, { server });
    expect(page.crashes).toEqual([]);
    expect(page.text()).toContain('Movies');
    expect(page.text()).toContain('The Mock Movie');
    page.unmount();
  });

  it('search shows what it found', async () => {
    const page = await renderPage(<SearchPage />, { path: '/search?q=mock', server });
    expect(page.crashes).toEqual([]);
    expect(page.text()).toContain('The Mock Movie');
    page.unmount();
  });

  it('favorites lists them', async () => {
    const page = await renderPage(<FavoritesPage />, { server });
    expect(page.crashes).toEqual([]);
    expect(page.text()).toContain('The Mock Movie');
    page.unmount();
  });

  it('account settings render', async () => {
    const page = await renderPage(<SettingsPage />, { server });
    expect(page.crashes).toEqual([]);
    expect(page.text()).toContain('Account Settings');
    page.unmount();
  });

  it('stats count only what was actually played', async () => {
    const playtime = {
      since: '2026-10-01',
      days: { [new Date().toISOString().slice(0, 10)]: { v: 7200, a: 300 } },
      items: { 'movie-1': { s: 7200, n: 2, k: 'video' }, 'song-1': { s: 300, n: 1, k: 'audio' } },
    };
    const marked = { ...movie, Id: 'movie-2', Name: 'Marked Only', UserData: { Played: true, PlayCount: 1, IsFavorite: false } };
    const page = await renderPage(<StatsPage />, {
      server: (path, init, url) => {
        if (path === '/DisplayPreferences/jellyfied-playtime')
          return { Id: 'jellyfied-playtime', CustomPrefs: { playtime: JSON.stringify(playtime) } };
        // What the server says was played (including what was only marked) is not asked for.
        if (path === '/Items' && url.searchParams.get('filters') === 'IsPlayed') return list([marked]);
        if (path === '/Items' && url.searchParams.get('ids')) return list([{ ...movie, Genres: ['Drama'] }]);
        return server(path, init, url);
      },
    });
    expect(page.crashes).toEqual([]);
    expect(page.text()).toContain('Your stats');
    expect(page.text()).toContain('2 hr');
    expect(page.text()).toContain('Drama');
    expect(page.text()).toContain('The Mock Movie2 times');
    expect(page.text()).not.toContain('Marked Only');
    page.unmount();
  });
});
