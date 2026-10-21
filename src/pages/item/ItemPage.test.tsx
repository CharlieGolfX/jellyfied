import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, type FakeServer } from '@/test/renderPage';
import ItemPage from './ItemPage';

/** The item page renders every kind of item it has a layout for. */

const me = { Id: 'user-1', Name: 'demo', Policy: { IsAdministrator: false }, Configuration: { OrderedViews: [] } };
const played = { Played: false, IsFavorite: false, PlaybackPositionTicks: 0 };

const movie = {
  Id: 'movie-1',
  Name: 'The Mock Movie',
  Type: 'Movie',
  MediaType: 'Video',
  ProductionYear: 2020,
  RunTimeTicks: 60_000_000_000,
  Overview: 'A film that exists only in this test.',
  Genres: ['Drama'],
  People: [{ Id: 'person-1', Name: 'Ada Actor', Role: 'Lead', Type: 'Actor' }],
  Studios: [{ Id: 'studio-1', Name: 'Mock Pictures' }],
  MediaSources: [
    {
      Id: 'source-1',
      Container: 'mkv',
      MediaStreams: [
        { Type: 'Video', Index: 0, Codec: 'h264', Width: 1920, Height: 1080, DisplayTitle: '1080p H264' },
        { Type: 'Audio', Index: 1, Codec: 'aac', Language: 'eng', DisplayTitle: 'English AAC' },
        { Type: 'Subtitle', Index: 2, Codec: 'srt', Language: 'nor', DisplayTitle: 'Norwegian' },
      ],
    },
  ],
  UserData: played,
};
const series = { Id: 'series-1', Name: 'The Mock Show', Type: 'Series', IsFolder: true, Overview: 'A show.', UserData: played };
const season = {
  Id: 'season-1',
  Name: 'Season 1',
  Type: 'Season',
  IndexNumber: 1,
  SeriesId: series.Id,
  SeriesName: series.Name,
  IsFolder: true,
  UserData: played,
};
const episode = {
  Id: 'ep-1',
  Name: 'Pilot',
  Type: 'Episode',
  MediaType: 'Video',
  IndexNumber: 1,
  ParentIndexNumber: 1,
  SeriesId: series.Id,
  SeriesName: series.Name,
  SeasonId: season.Id,
  RunTimeTicks: 30_000_000_000,
  UserData: played,
};
const album = {
  Id: 'album-1',
  Name: 'Mock Album',
  Type: 'MusicAlbum',
  IsFolder: true,
  AlbumArtist: 'Mock Band',
  AlbumArtists: [{ Id: 'artist-1', Name: 'Mock Band' }],
  UserData: played,
};
const track = {
  Id: 'track-1',
  Name: 'First Song',
  Type: 'Audio',
  MediaType: 'Audio',
  AlbumId: album.Id,
  IndexNumber: 1,
  RunTimeTicks: 2_000_000_000,
  UserData: played,
};
const artist = { Id: 'artist-1', Name: 'Mock Band', Type: 'MusicArtist', IsFolder: true, UserData: played };
const person = { Id: 'person-1', Name: 'Ada Actor', Type: 'Person', Overview: 'An actor.', UserData: played };
const boxSet = { Id: 'set-1', Name: 'Mock Collection', Type: 'BoxSet', IsFolder: true, UserData: played };
const playlist = { Id: 'list-1', Name: 'Mock Playlist', Type: 'Playlist', IsFolder: true, MediaType: 'Audio', UserData: played };
const genre = { Id: 'genre-1', Name: 'Drama', Type: 'Genre', UserData: played };

const items = [movie, series, season, episode, album, track, artist, person, boxSet, playlist, genre];
const list = (xs: unknown[]) => ({ Items: xs, TotalRecordCount: xs.length, StartIndex: 0 });

const server: FakeServer = (path, init, url) => {
  if (init?.method && init.method !== 'GET') return null;
  if (path === '/Users/Me') return me;
  const item = items.find((i) => path === `/Items/${i.Id}` || path === `/Users/user-1/Items/${i.Id}`);
  if (item) return item;
  if (path === `/Shows/${series.Id}/Seasons`) return list([season]);
  if (path === `/Shows/${series.Id}/Episodes`) return list([episode]);
  if (path === '/Shows/NextUp') return list([episode]);
  const parent = url.searchParams.get('parentId') ?? url.searchParams.get('ParentId');
  if (path === '/Items' && parent === album.Id) return list([track]);
  if (path === '/Items' && parent === boxSet.Id) return list([movie]);
  if (path === `/Playlists/${playlist.Id}/Items`) return list([track]);
  if (path === '/Items' && (url.searchParams.get('personIds') || url.searchParams.get('genreIds'))) return list([movie]);
  if (path === '/Items' && url.searchParams.get('artistIds')) return list([album]);
  if (/\/(SpecialFeatures|LocalTrailers)$/.test(path) || path === '/Sessions') return [];
  if (path.startsWith('/Items/')) return list([]);
  return list([]);
};

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('the item page', () => {
  const cases: [kind: string, id: string, shows: string[]][] = [
    ['a film', movie.Id, ['The Mock Movie', 'A film that exists only in this test.', 'Ada Actor', 'Drama']],
    ['a series', series.Id, ['The Mock Show', 'Season 1']],
    ['a season', season.Id, ['The Mock Show', 'Pilot']],
    ['an episode', episode.Id, ['Pilot', 'The Mock Show']],
    ['an album', album.Id, ['Mock Album', 'First Song']],
    ['an artist', artist.Id, ['Mock Band', 'Mock Album']],
    ['a person', person.Id, ['Ada Actor', 'The Mock Movie']],
    ['a collection', boxSet.Id, ['Mock Collection', 'The Mock Movie']],
    ['a playlist', playlist.Id, ['Mock Playlist', 'First Song']],
    ['a genre', genre.Id, ['Drama', 'The Mock Movie']],
  ];

  it.each(cases)('shows %s', async (_kind, id, shows) => {
    const page = await renderPage(<ItemPage />, { path: `/item/${id}`, route: '/item/:id', server });
    expect(page.crashes).toEqual([]);
    for (const text of shows) expect(page.text()).toContain(text);
    page.unmount();
  });

  it('says so when the item does not exist', async () => {
    const page = await renderPage(<ItemPage />, {
      path: '/item/nope',
      route: '/item/:id',
      server: (p, i, u) => (p.includes('nope') ? undefined : server(p, i, u)),
    });
    expect(page.crashes).toEqual([]);
    expect(page.container.querySelector('.text-danger')).not.toBeNull();
    page.unmount();
  });
});
