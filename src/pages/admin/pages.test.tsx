import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, type FakeServer } from '@/test/renderPage';
import AdminRoutes from './AdminRoutes';

/** Every dashboard page renders against a small server, without crashing or failing to load. */

const admin = {
  Id: 'user-1',
  Name: 'demo',
  HasPassword: true,
  Policy: { IsAdministrator: true, EnableAllFolders: true, EnabledFolders: [], AuthenticationProviderId: 'Default' },
  Configuration: { OrderedViews: [] },
};
const viewer = { ...admin, Id: 'user-2', Name: 'viewer', Policy: { ...admin.Policy, IsAdministrator: false } };
const day = '2026-01-15T20:00:00.0000000Z';

const answers: Record<string, unknown> = {
  '/Users/Me': admin,
  '/Users': [admin, viewer],
  '/Users/user-2': viewer,
  '/System/Info': {
    ServerName: 'Mock Server',
    Version: '10.11.0',
    Id: 'server-1',
    OperatingSystem: 'Linux',
    LocalAddress: 'http://10.0.0.2:8096',
  },
  '/System/Info/Public': { ServerName: 'Mock Server', Version: '10.11.0', Id: 'server-1' },
  '/System/Info/Storage': {},
  '/System/Configuration': { ServerName: 'Mock Server', UICulture: 'en-US', MetadataCountryCode: 'US', PreferredMetadataLanguage: 'en' },
  '/System/Configuration/metadata': { UseFileCreationTimeForDateAdded: true },
  '/System/Configuration/xbmcmetadata': { UserId: null, ReleaseDateFormat: 'yyyy-MM-dd' },
  '/System/Configuration/encoding': { HardwareAccelerationType: 'none', EncodingThreadCount: -1 },
  '/System/Configuration/network': { LocalNetworkSubnets: [], KnownProxies: [], InternalHttpPort: 8096 },
  '/Branding/Configuration': { LoginDisclaimer: 'Private server', CustomCss: '' },
  '/Localization/Cultures': [
    { Name: 'English', DisplayName: 'English', TwoLetterISOLanguageName: 'en', ThreeLetterISOLanguageNames: ['eng'] },
  ],
  '/Localization/Countries': [{ Name: 'US', DisplayName: 'United States', TwoLetterISORegionName: 'US' }],
  '/Localization/Options': [{ Name: 'English', Value: 'en-US' }],
  '/Localization/ParentalRatings': [{ Name: 'PG-13', Value: 13 }],
  '/Library/VirtualFolders': [
    { Name: 'Movies', CollectionType: 'movies', ItemId: 'lib-1', Locations: ['/media/movies'], LibraryOptions: {}, RefreshStatus: 'Idle' },
  ],
  '/Library/MediaFolders': { Items: [{ Id: 'lib-1', Name: 'Movies', CollectionType: 'movies' }], TotalRecordCount: 1 },
  '/Items/Counts': { MovieCount: 1, SeriesCount: 0, EpisodeCount: 0 },
  '/ScheduledTasks': [
    { Id: 'task-1', Name: 'Scan media library', Category: 'Library', Key: 'RefreshLibrary', State: 'Idle', Triggers: [] },
  ],
  '/Sessions': [],
  '/Devices': {
    Items: [{ Id: 'dev-1', Name: 'Firefox', AppName: 'Jellyfied', LastUserName: 'demo', LastUserId: 'user-1', DateLastActivity: day }],
    TotalRecordCount: 1,
  },
  '/Plugins': [{ Id: 'plugin-1', Name: 'Mock Plugin', Version: '1.0.0.0', Status: 'Active', CanUninstall: true }],
  '/Packages': [],
  '/Repositories': [{ Name: 'Jellyfin Stable', Url: 'https://repo.jellyfin.org/files/plugin/manifest.json', Enabled: true }],
  '/web/ConfigurationPages': [],
  '/Auth/Keys': { Items: [{ AccessToken: 'abc', AppName: 'Mock key', DateCreated: day }], TotalRecordCount: 1 },
  '/System/Logs': [{ Name: 'log_20260115.log', DateModified: day, DateCreated: day, Size: 2048 }],
  '/System/ActivityLog/Entries': {
    Items: [{ Id: 1, Name: 'demo signed in', Date: day, Severity: 'Information', Type: 'SessionStarted', UserId: 'user-1' }],
    TotalRecordCount: 1,
  },
  '/Backup': [],
  '/Environment/Drives': [],
};

const server: FakeServer = (path, init) => {
  if (init?.method && init.method !== 'GET') return null;
  if (path in answers) return answers[path];
  return { Items: [], TotalRecordCount: 0 };
};

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('the server dashboard', () => {
  const pages: [path: string, shows: string][] = [
    ['/admin', 'Mock Server'],
    ['/admin/general', 'United States'],
    ['/admin/users', 'viewer'],
    ['/admin/users/user-2', 'viewer'],
    ['/admin/libraries', '/media/movies'],
    ['/admin/metadata', 'yyyy-MM-dd'],
    ['/admin/branding', 'Private server'],
    ['/admin/backups', ''],
    ['/admin/playback', ''],
    ['/admin/network', '8096'],
    ['/admin/tasks', 'Scan media library'],
    ['/admin/activity', 'demo signed in'],
    ['/admin/devices', 'Firefox'],
    ['/admin/plugins', 'Mock Plugin'],
    ['/admin/apikeys', 'Mock key'],
    ['/admin/logs', 'log_20260115.log'],
  ];

  it.each(pages)('%s renders', async (path, shows) => {
    const page = await renderPage(<AdminRoutes />, { path, route: '/admin/*', server });
    expect(page.crashes).toEqual([]);
    expect(page.container.querySelector('.text-danger')).toBeNull();
    const fields = [...page.container.querySelectorAll('input, textarea')].map((f) => (f as HTMLInputElement).value);
    expect([page.text(), ...fields].join(' ')).toContain(shows);
    page.unmount();
  });

  it('closes itself to users who are not administrators', async () => {
    const page = await renderPage(<AdminRoutes />, {
      path: '/admin/users',
      route: '/admin/*',
      server: (path, init, url) => (path === '/Users/Me' ? viewer : server(path, init, url)),
    });
    expect(page.text()).not.toContain('viewer');
    page.unmount();
  });
});
