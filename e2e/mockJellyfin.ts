import type { Page, Route } from '@playwright/test';

/**
 * A small fake Jellyfin server, answered from inside the browser, so the smoke tests need no real
 * server. It knows one user (demo / secret), one library and one movie.
 */
export const SERVER = '/jellyfin';
export const USER = { name: 'demo', password: 'secret' };

const user = {
  Id: 'user-1',
  Name: USER.name,
  ServerId: 'server-1',
  HasPassword: true,
  Policy: { IsAdministrator: false },
  Configuration: { OrderedViews: [], SubtitleMode: 'Default', EnableNextEpisodeAutoPlay: true },
};

const library = { Id: 'lib-movies', Name: 'Movies', Type: 'CollectionFolder', CollectionType: 'movies', IsFolder: true };

const movie = {
  Id: 'movie-1',
  Name: 'The Mock Movie',
  Type: 'Movie',
  MediaType: 'Video',
  ProductionYear: 2020,
  RunTimeTicks: 60_000_000_000,
  Overview: 'A film that exists only in this test.',
  Genres: ['Drama'],
  UserData: { Played: false, IsFavorite: false, PlaybackPositionTicks: 0 },
};

/** Fields of the wrong type, as a misbehaving plugin might send: rendering this item throws. */
const brokenMovie = { ...movie, Id: 'movie-broken', Name: 'Broken', Genres: 5, People: 5, Studios: 5, MediaSources: 5, Tags: 5 };

const list = (items: unknown[]) => ({ Items: items, TotalRecordCount: items.length, StartIndex: 0 });

interface MockOptions {
  /** Sign the demo user in as an administrator. */
  admin?: boolean;
}

const serverConfig = { ServerName: 'Mock Server', UICulture: 'en-US', PreferredMetadataLanguage: 'en', MetadataCountryCode: 'US' };

function answer(route: Route, options: MockOptions): { status?: number; body?: unknown } {
  const me = options.admin ? { ...user, Policy: { ...user.Policy, IsAdministrator: true } } : user;
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.slice(SERVER.length);
  const method = request.method();

  if (path === '/System/Info/Public') {
    return { body: { ServerName: 'Mock Server', Version: '10.11.0', Id: 'server-1', StartupWizardCompleted: true } };
  }
  if (path === '/Users/Public') return { body: [] };
  if (path === '/QuickConnect/Enabled') return { body: false };
  if (path === '/Users/AuthenticateByName') {
    const body = request.postDataJSON() as { Username?: string; Pw?: string };
    if (body.Username !== USER.name || body.Pw !== USER.password) return { status: 401 };
    return { body: { User: me, AccessToken: 'mock-token', ServerId: 'server-1' } };
  }

  // Everything else needs the token the login handed out.
  if (!(request.headers().authorization ?? '').includes('Token="mock-token"')) return { status: 401 };

  if (path === '/Users/Me') return { body: me };
  // The server dashboard.
  if (path === '/Users') return { body: [me] };
  if (path === '/System/Info') return { body: { ServerName: 'Mock Server', Version: '10.11.0', OperatingSystem: 'Linux', Id: 'server-1' } };
  if (path === '/Items/Counts') return { body: { MovieCount: 1, SeriesCount: 0, EpisodeCount: 0, SongCount: 0, AlbumCount: 0 } };
  if (path === '/System/Info/Storage') return { status: 404 };
  if (path === '/ScheduledTasks' || path === '/Localization/Countries') return { body: [] };
  if (path === '/System/Configuration' && method === 'GET') return { body: serverConfig };
  if (path === `/Items/${movie.Id}/MetadataEditor`)
    return { body: { ExternalIdInfos: [], ParentalRatingOptions: [], Countries: [], Cultures: [] } };
  if (path === '/Sessions/Logout') return { status: 204 };
  if (path === '/UserViews') return { body: list([library]) };
  if (path === '/Items/Latest') return { body: [movie] };
  if (path === '/Items') return { body: list(url.searchParams.has('searchTerm') || url.searchParams.has('parentId') ? [movie] : []) };
  if (path === `/Items/${library.Id}`) return { body: library };
  if (path === `/Items/${movie.Id}`) return { body: movie };
  if (path === `/Items/${brokenMovie.Id}`) return { body: brokenMovie };
  if (/^\/Items\/[^/]+$/.test(path)) return { status: 404 };
  if (/\/(SpecialFeatures|LocalTrailers)$/.test(path) || path === '/Sessions' || path === '/Localization/Cultures') return { body: [] };
  // There is no media behind the mock movie: the player opens and reports that.
  if (path === `/Items/${movie.Id}/PlaybackInfo`) return { body: { MediaSources: [], PlaySessionId: 'play-1' } };
  if (method !== 'GET') return { status: 204 };
  return { body: list([]) };
}

export async function mockJellyfin(page: Page, options: MockOptions = {}) {
  // What the container's entrypoint writes when JELLYFIN_URL is set.
  await page.route('**/config.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.JELLYPLEX_CONFIG = { serverUrl: "${SERVER}", lockServer: true };`,
    }),
  );
  // The realtime connection (remote control, SyncPlay): accepted and left silent.
  await page.routeWebSocket(`**${SERVER}/socket**`, () => {});
  await page.route(`**${SERVER}/**`, (route) => {
    // No artwork: the cards fall back to their placeholders.
    if (/\/Images\/|\/UserImage/.test(route.request().url())) return route.fulfill({ status: 404 });
    const { status = 200, body } = answer(route, options);
    return route.fulfill({ status, contentType: 'application/json', body: body === undefined ? '' : JSON.stringify(body) });
  });
}

export async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Username').fill(USER.name);
  await page.getByLabel('Password').fill(USER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}
