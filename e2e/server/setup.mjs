// A throwaway Jellyfin server with a few seconds of generated test media, and Jellyfied in front of
// it, for the tests that need a real server (live.spec.ts, syncplay-live.spec.ts).
//
//   node e2e/server/setup.mjs up [jellyfin image tag] [jellyfied image]
//   node e2e/server/setup.mjs down
//
// `up` generates the media (ffmpeg, in a container), starts Jellyfin (default tag 10.11), runs its
// setup wizard, adds a Movies and a Shows library and waits for the scan, makes a second user, and
// starts Jellyfied (default image jellyfied:ci, as `npm run test:container` builds it) proxying
// that server. It prints the environment for the tests, and appends it to $GITHUB_ENV in CI.
//
// The media: two films (and short fillers), a show with two episodes, a song with timed lyrics,
// and two Live TV channels with a guide, H.264 and AAC in Matroska. The first film is
// 720p at 3 Mbps, so lowering the quality transcodes, and has a SubRip and a styled (ASS) subtitle
// track. ffmpeg cannot write PGS or VobSub from text, so the
// tests for those skip themselves.
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [command = 'up', tag = '10.11', jellyfiedImage = 'jellyfied:ci'] = process.argv.slice(2);
const NETWORK = 'jellyfied-e2e';
const JELLYFIN = 'jellyfied-e2e-jellyfin';
const JELLYFIED = 'jellyfied-e2e-app';
const FFMPEG = 'linuxserver/ffmpeg:9.0.2';
const JELLYFIN_PORT = Number(process.env.E2E_JELLYFIN_PORT ?? 18096);
const APP_PORT = Number(process.env.E2E_APP_PORT ?? 18080);
const MEDIA = process.env.E2E_MEDIA_DIR ?? join(tmpdir(), 'jellyfied-e2e-media');
const USERS = { owner: { name: 'e2e', password: 'e2e-password' }, friend: { name: 'e2e-friend', password: 'e2e-password' } };
const server = `http://localhost:${JELLYFIN_PORT}`;

const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();
const quietly = (...args) => spawnSync('docker', args, { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...args) => console.log('e2e server:', ...args);

function down() {
  quietly('rm', '-f', JELLYFIED, JELLYFIN);
  quietly('network', 'rm', NETWORK);
}

if (command === 'down') {
  down();
  process.exit(0);
}
if (command !== 'up') {
  console.error('usage: setup.mjs up [jellyfin tag] [jellyfied image] | down');
  process.exit(2);
}

// ---- Media ------------------------------------------------------------------------------------
const SRT = `1
00:00:01,000 --> 00:00:20,000
Plain subtitle line

2
00:00:21,000 --> 00:00:59,000
Another plain line
`;
const ASS = `[Script Info]
ScriptType: v4.00+
PlayResX: 640
PlayResY: 360

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,28,&H0000FFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,8,10,10,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:59.00,Default,,0,0,0,,{\\an8}Styled subtitle line
`;

function video(path, { seconds, subtitles = false, tone = 440, large = false }) {
  const size = large ? '1280x720' : '640x360';
  const inputs = ['-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=25`, '-f', 'lavfi', '-i', `sine=frequency=${tone}:sample_rate=48000`];
  const maps = ['-map', '0:v', '-map', '1:a'];
  const codecs = ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-g', '50', '-c:a', 'aac', '-b:a', '96k'];
  // Above the player's "2 Mbps 480p" in both size and bitrate, so choosing it makes the server transcode.
  if (large) codecs.push('-b:v', '3M', '-minrate', '3M', '-maxrate', '3M', '-bufsize', '3M');
  if (subtitles) {
    inputs.push('-i', '/media/subs.srt', '-i', '/media/subs.ass');
    maps.push('-map', '2', '-map', '3');
    codecs.push(
      '-c:s:0',
      'srt',
      '-c:s:1',
      'ass',
      '-metadata:s:s:0',
      'language=eng',
      '-metadata:s:s:1',
      'language=eng',
      '-metadata:s:s:1',
      'title=Styled',
    );
  }
  docker(
    'run',
    '--rm',
    '-v',
    `${MEDIA}:/media`,
    FFMPEG,
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    ...inputs,
    '-t',
    String(seconds),
    ...maps,
    ...codecs,
    `/media/${path}`,
  );
}

log(`generating media in ${MEDIA}`);
rmSync(MEDIA, { recursive: true, force: true });
for (const dir of ['movies/Alpha Test (2020)', 'movies/Sierra Test (2021)', 'shows/Test Show (2022)/Season 01']) {
  mkdirSync(join(MEDIA, dir), { recursive: true });
}
writeFileSync(join(MEDIA, 'subs.srt'), SRT);
writeFileSync(join(MEDIA, 'subs.ass'), ASS);
video('movies/Alpha Test (2020)/Alpha Test (2020).mkv', { seconds: 60, subtitles: true, large: true });
video('movies/Sierra Test (2021)/Sierra Test (2021).mkv', { seconds: 30, tone: 660 });
video('shows/Test Show (2022)/Season 01/Test Show S01E01.mkv', { seconds: 20, tone: 520 });
video('shows/Test Show (2022)/Season 01/Test Show S01E02.mkv', { seconds: 20, tone: 580 });
// Enough films for the letter bar and the year filter to matter: three short ones under every
// letter, copies of one clip. "Az …" sorts after "Alpha Test", which stays the first film.
const FILLERS = 26 * 3;
video('filler.mkv', { seconds: 3, tone: 330 });
[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].forEach((letter, l) => {
  for (let n = 1; n <= 3; n++) {
    const name = `${letter}z Filler ${n} (${2000 + ((l * 3 + n) % 4)})`;
    mkdirSync(join(MEDIA, 'movies', name));
    copyFileSync(join(MEDIA, 'filler.mkv'), join(MEDIA, 'movies', name, `${name}.mkv`));
  }
});
rmSync(join(MEDIA, 'filler.mkv'));
// A song with timed lyrics next to it (LRC), which Jellyfin 10.9 and later reads.
mkdirSync(join(MEDIA, 'music/Test Band/Test Album'), { recursive: true });
docker(
  'run',
  '--rm',
  '-v',
  `${MEDIA}:/media`,
  FFMPEG,
  '-hide_banner',
  '-loglevel',
  'error',
  '-y',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=392:sample_rate=44100',
  '-t',
  '30',
  '-c:a',
  'libmp3lame',
  '-b:a',
  '64k',
  '-metadata',
  'title=Test Song',
  '-metadata',
  'artist=Test Band',
  '-metadata',
  'album_artist=Test Band',
  '-metadata',
  'album=Test Album',
  '-metadata',
  'track=1',
  '/media/music/Test Band/Test Album/01 - Test Song.mp3',
);
writeFileSync(
  join(MEDIA, 'music/Test Band/Test Album/01 - Test Song.lrc'),
  '[ti:Test Song]\n[ar:Test Band]\n[00:00.50]First line of the song\n[00:04.00]Second line of the song\n[00:08.00]Third line of the song\n',
);
rmSync(join(MEDIA, 'subs.srt'));
rmSync(join(MEDIA, 'subs.ass'));

// ---- Jellyfin -----------------------------------------------------------------------------------
down();
docker('network', 'create', NETWORK);
log(`starting jellyfin/jellyfin:${tag}`);
docker(
  'run',
  '-d',
  '--name',
  JELLYFIN,
  '--network',
  NETWORK,
  '--network-alias',
  'jellyfin',
  '-p',
  `${JELLYFIN_PORT}:8096`,
  '-v',
  `${MEDIA}:/media:ro`,
  `jellyfin/jellyfin:${tag}`,
);

const AUTH = 'MediaBrowser Client="Jellyfied e2e setup", Device="ci", DeviceId="jellyfied-e2e-setup", Version="1"';
let token = '';
async function api(method, path, body) {
  const init = { method, headers: { Authorization: token ? `${AUTH}, Token="${token}"` : AUTH } };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(server + path, init);
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function until(what, check, seconds = 180) {
  for (let i = 0; i < seconds; i++) {
    try {
      if (await check()) return;
    } catch {
      /* not yet */
    }
    await sleep(1000);
  }
  console.log(spawnSync('docker', ['logs', '--tail', '40', JELLYFIN], { encoding: 'utf8' }).stdout);
  throw new Error(`timed out waiting for ${what}`);
}

await until('Jellyfin to start', async () => (await api('GET', '/System/Info/Public')).Version);
const info = await api('GET', '/System/Info/Public');
log(`Jellyfin ${info.Version} is up`);

if (!info.StartupWizardCompleted) {
  await api('POST', '/Startup/Configuration', { UICulture: 'en-US', MetadataCountryCode: 'US', PreferredMetadataLanguage: 'en' });
  // The first user exists once it has been asked for.
  await until('the first user', () => api('GET', '/Startup/User'), 30);
  await api('POST', '/Startup/User', { Name: USERS.owner.name, Password: USERS.owner.password });
  await api('POST', '/Startup/RemoteAccess', { EnableRemoteAccess: true, EnableAutomaticPortMapping: false });
  await api('POST', '/Startup/Complete');
}
await until('the setup wizard to finish', async () => (await api('GET', '/System/Info/Public')).StartupWizardCompleted, 60);

const auth = await api('POST', '/Users/AuthenticateByName', { Username: USERS.owner.name, Pw: USERS.owner.password });
token = auth.AccessToken;

// No metadata from the internet: the names come from the folders, and the scan stays quick.
const libraryOptions = (path) => ({
  LibraryOptions: {
    PathInfos: [{ Path: path }],
    EnableInternetProviders: false,
    MetadataSavers: [],
    TypeOptions: [],
    EnableRealtimeMonitor: false,
    EnableTrickplayImageExtraction: false,
    EnableChapterImageExtraction: false,
  },
});
await api('POST', '/Library/VirtualFolders?name=Movies&collectionType=movies&refreshLibrary=false', libraryOptions('/media/movies'));
await api('POST', '/Library/VirtualFolders?name=Shows&collectionType=tvshows&refreshLibrary=false', libraryOptions('/media/shows'));
await api('POST', '/Library/VirtualFolders?name=Music&collectionType=music&refreshLibrary=false', libraryOptions('/media/music'));
await api('POST', '/Library/Refresh');
const count = async (types) =>
  (await api('GET', `/Items?recursive=true&includeItemTypes=${types}&userId=${auth.User.Id}&limit=0`)).TotalRecordCount;
await until(
  'the library scan',
  async () => (await count('Movie')) === 2 + FILLERS && (await count('Episode')) === 2 && (await count('Audio')) === 1,
);
log(`libraries scanned: ${2 + FILLERS} films, 1 show with 2 episodes, 1 song with lyrics`);

// Live TV: an M3U tuner with two channels that stream a filler film from Jellyfin itself (each
// at an address of its own: Jellyfin takes channels with the same one to be the same), and an
// XMLTV guide from two hours ago to a day ahead, made of hour-long programmes. The ones on the
// second channel are episodes of a series, so a series recording can be set up.
const filler = (await api('GET', `/Items?recursive=true&includeItemTypes=Movie&searchTerm=Filler&limit=1&userId=${auth.User.Id}`)).Items[0];
mkdirSync(join(MEDIA, 'livetv'), { recursive: true });
const stream = `http://localhost:8096/Videos/${filler.Id}/stream?static=true&api_key=${token}`;
writeFileSync(
  join(MEDIA, 'livetv/channels.m3u'),
  `#EXTM3U\n#EXTINF:-1 tvg-id="one.test" tvg-chno="1",Test One\n${stream}&channel=1\n#EXTINF:-1 tvg-id="two.test" tvg-chno="2",Test Two\n${stream}&channel=2\n`,
);
const xmltvTime = (ms) => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 14) + ' +0000';
const hour = 3_600_000;
const firstHour = Math.floor(Date.now() / hour) * hour - 2 * hour;
let programmes = '';
for (let i = 0; i < 26; i++) {
  const from = xmltvTime(firstHour + i * hour);
  const to = xmltvTime(firstHour + (i + 1) * hour);
  programmes += `<programme start="${from}" stop="${to}" channel="one.test"><title>News ${i + 1}</title><desc>The news, hour ${i + 1}.</desc></programme>\n`;
  programmes += `<programme start="${from}" stop="${to}" channel="two.test"><title>Test Series</title><sub-title>Episode ${i + 1}</sub-title><desc>Episode ${i + 1} of the test series.</desc><episode-num system="xmltv_ns">0.${i}.</episode-num></programme>\n`;
}
writeFileSync(
  join(MEDIA, 'livetv/guide.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<tv><channel id="one.test"><display-name>Test One</display-name></channel><channel id="two.test"><display-name>Test Two</display-name></channel>\n${programmes}</tv>\n`,
);
await api('POST', '/LiveTv/TunerHosts', {
  Type: 'm3u',
  Url: '/media/livetv/channels.m3u',
  ImportFavoritesOnly: false,
  AllowHWTranscoding: false,
  TunerCount: 0,
});
await api('POST', '/LiveTv/ListingProviders?validateListings=false&validateLogin=false', {
  Type: 'xmltv',
  Path: '/media/livetv/guide.xml',
  EnableAllTuners: true,
});
const guideTask = (await api('GET', '/ScheduledTasks')).find((task) => task.Key === 'RefreshGuide');
if (guideTask) await api('POST', `/ScheduledTasks/Running/${guideTask.Id}`);
await until('the guide', async () => (await api('GET', `/LiveTv/Programs?userId=${auth.User.Id}`)).Items.length > 40);
log('Live TV: 2 channels with a day of guide');

// The Intro Skipper plugin, whose segment editor API lets Jellyfied change skippable segments.
// Best effort: it comes from the plugin's own site, and without it that test checks the
// read-only view instead.
try {
  const INTRO_SKIPPER = 'https://intro-skipper.org/manifest.json';
  const repos = await api('GET', '/Repositories');
  await api('POST', '/Repositories', [...repos, { Name: 'Intro Skipper', Url: INTRO_SKIPPER, Enabled: true }]);
  const plugin = (await api('GET', '/Packages')).find((p) => p.name === 'Intro Skipper');
  if (!plugin) throw new Error('not in the repository');
  await api('POST', `/Packages/Installed/${encodeURIComponent(plugin.name)}?assemblyGuid=${plugin.guid}`);
  await until('the plugin to download', async () => (await api('GET', '/Plugins')).some((p) => p.Name === 'Intro Skipper'), 60);
  await api('POST', '/System/Restart');
  await sleep(5000);
  await until('Jellyfin to restart', async () => (await api('GET', '/MediaSegmentsApi')).version, 120);
  log('Intro Skipper installed');
} catch (err) {
  log(`Intro Skipper not installed (${err.message}); segment editing is tested read-only`);
}

const friend = await api('POST', '/Users/New', { Name: USERS.friend.name, Password: USERS.friend.password });
log(`users: ${USERS.owner.name} (administrator), ${USERS.friend.name} (${friend.Id})`);

// ---- Jellyfied ----------------------------------------------------------------------------------
log(`starting ${jellyfiedImage}`);
docker(
  'run',
  '-d',
  '--name',
  JELLYFIED,
  '--network',
  NETWORK,
  '-p',
  `${APP_PORT}:80`,
  '-e',
  'JELLYFIN_URL=http://jellyfin:8096',
  jellyfiedImage,
);
await until('Jellyfied to start', async () => (await fetch(`http://localhost:${APP_PORT}/healthz`)).ok, 30);

const env = {
  E2E_BASE_URL: `http://localhost:${APP_PORT}`,
  E2E_USERNAME: USERS.owner.name,
  E2E_PASSWORD: USERS.owner.password,
  E2E_FRIEND_USERNAME: USERS.friend.name,
  E2E_FRIEND_PASSWORD: USERS.friend.password,
};
const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`);
if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, lines.join('\n') + '\n');
log(`ready. Run the tests with:\n\n  ${lines.join(' ')} npx playwright test e2e/live.spec.ts e2e/syncplay-live.spec.ts\n`);
