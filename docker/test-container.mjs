// Starts the Jellyfied image against a stand-in Jellyfin server and checks what it serves:
// the site, its headers, the reverse proxy (including a WebSocket), and serving under a base path.
//
//   node docker/test-container.mjs [image]      (default image: jellyfied:ci)
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import http from 'node:http';

const image = process.argv[2] ?? 'jellyfied:ci';
const PORT = 18097;
const origin = `http://localhost:${PORT}`;
let failures = 0;

function check(name, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${ok || !detail ? '' : `\n        ${detail}`}`);
}

// ---- The stand-in server: answers every request with what it was asked, and accepts WebSockets.
const upstream = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ url: req.url, host: req.headers.host, forwardedFor: req.headers['x-forwarded-for'] ?? null }));
});
upstream.on('upgrade', (req, socket) => {
  const accept = createHash('sha1').update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  // One unmasked text frame carrying the path that reached the server.
  const text = Buffer.from(req.url);
  socket.write(Buffer.concat([Buffer.from([0x81, text.length]), text]));
  // Hang up afterwards: nginx writes its log line for a WebSocket when the connection ends.
  setTimeout(() => socket.end(), 200);
});
await new Promise((resolve) => upstream.listen(0, '0.0.0.0', resolve));
const upstreamPort = upstream.address().port;

const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();

async function withContainer(env, run) {
  const name = `jellyfied-test-${process.pid}`;
  spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' });
  docker(
    'run',
    '-d',
    '--name',
    name,
    '-p',
    `${PORT}:80`,
    '--add-host',
    'host.docker.internal:host-gateway',
    ...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]),
    image,
  );
  try {
    let up = false;
    for (let i = 0; i < 40 && !up; i++) {
      up = await fetch(`${origin}/healthz`).then(
        (r) => r.ok,
        () => false,
      );
      if (!up) await new Promise((r) => setTimeout(r, 500));
    }
    check('the container starts and answers its health check', up);
    if (up) await run(name);
    if (failures) console.log(spawnSync('docker', ['logs', name], { encoding: 'utf8' }).stdout.split('\n').slice(-30).join('\n'));
  } finally {
    spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' });
  }
}

const text = (path, init) => fetch(origin + path, init).then((r) => r.text());

function webSocketPath(path) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}${path}`);
    const timer = setTimeout(() => resolve(null), 5000);
    ws.addEventListener('message', (e) => {
      clearTimeout(timer);
      resolve(String(e.data));
      ws.close();
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

console.log(`\n${image}: at the root, proxying a server that lives under /base`);
await withContainer({ JELLYFIN_URL: `http://host.docker.internal:${upstreamPort}/base` }, async (name) => {
  check('nginx does not run as root', docker('exec', name, 'id', '-u') !== '0');

  const home = await fetch(`${origin}/`);
  const page = await home.text();
  check('serves the app', page.includes('<div id="root">') && page.includes('<base href="/"'));
  const csp = home.headers.get('content-security-policy') ?? '';
  check(
    'sends a Content-Security-Policy without inline styles or scripts',
    csp.includes("script-src 'self'") && !/style-src[^;]*unsafe-inline/.test(csp),
    csp,
  );
  check(
    'forbids framing and type sniffing',
    home.headers.get('x-frame-options') === 'DENY' && home.headers.get('x-content-type-options') === 'nosniff',
  );
  check('client-side routes get the app too', (await text('/library/some-id')).includes('<div id="root">'));
  check('config.js points the browser at the proxy', (await text('/config.js')).includes('serverUrl: "/jellyfin"'));

  const asset = /assets\/index-[\w-]+\.js/.exec(page)?.[0];
  const js = await fetch(`${origin}/${asset}`, { headers: { 'Accept-Encoding': 'gzip' } });
  check(
    'build assets are cached forever and sent precompressed',
    (js.headers.get('cache-control') ?? '').includes('immutable') && js.headers.get('content-encoding') === 'gzip',
  );
  check('the precompressed file is in the image', docker('exec', name, 'sh', '-c', `ls /usr/share/nginx/html/${asset}.gz`).endsWith('.gz'));
  check('a missing asset is a 404, not the app', (await fetch(`${origin}/assets/nope.js`)).status === 404);

  const proxied = await fetch(`${origin}/jellyfin/System/Info/Public?x=1`).then(
    (r) => r.json(),
    () => null,
  );
  check('the proxy forwards to the server, under its base path', proxied?.url === '/base/System/Info/Public?x=1', JSON.stringify(proxied));
  check('the proxy passes the client address on', Boolean(proxied?.forwardedFor));
  // The SyncPlay picker (njs) asks the server who is calling; this server knows nobody.
  const picker = await fetch(`${origin}/jellyfied-api/syncplay/aaaaaaaabbbbccccddddeeeeeeeeeeee`, {
    headers: { Authorization: 'MediaBrowser Token="t"' },
  });
  check(
    'the SyncPlay picker runs, and turns away a caller the server does not know',
    picker.status === 401 && (await picker.json()).code === 'notSignedIn',
  );
  const forwardedFor = (header) =>
    fetch(`${origin}/jellyfin/Users/Me`, { headers: { 'X-Forwarded-For': header } }).then(
      (r) => r.json().then((j) => j.forwardedFor),
      () => null,
    );
  const viaTunnel = await forwardedFor('203.0.113.7');
  check("behind a proxy, the server is told the visitor's address, not the proxy's", viaTunnel === '203.0.113.7', viaTunnel);
  const viaTwo = await forwardedFor('198.51.100.4, 203.0.113.7, 10.0.0.3');
  check('an address the visitor made up is not believed', viaTwo === '203.0.113.7', viaTwo);
  const encoded = await fetch(`${origin}/jellyfin/Items/a%20b%2Fc`).then(
    (r) => r.json(),
    () => null,
  );
  check('encoded characters in a path reach the server unchanged', encoded?.url === '/base/Items/a%20b%2Fc', JSON.stringify(encoded));
  check(
    'WebSockets go through the proxy',
    (await webSocketPath('/jellyfin/socket?ApiKey=secret-token&deviceId=d')) === '/base/socket?ApiKey=secret-token&deviceId=d',
  );

  // The line for a WebSocket is written when it closes.
  await new Promise((r) => setTimeout(r, 1500));
  const logs = spawnSync('docker', ['logs', name], { encoding: 'utf8' });
  const log = logs.stdout + logs.stderr;
  check('access tokens are kept out of the access log', log.includes('ApiKey=***') && !log.includes('secret-token'));
});

console.log(`\n${image}: trusting no proxies`);
await withContainer({ JELLYFIN_URL: `http://host.docker.internal:${upstreamPort}`, JELLYFIED_TRUSTED_PROXIES: 'none' }, async () => {
  const seen = await fetch(`${origin}/jellyfin/Users/Me`, { headers: { 'X-Forwarded-For': '203.0.113.7' } }).then(
    (r) => r.json().then((j) => j.forwardedFor),
    () => null,
  );
  check('X-Forwarded-For from the peer is ignored', Boolean(seen) && seen !== '203.0.113.7', seen);
});

console.log(`\n${image}: under /jellyfied`);
await withContainer({ JELLYFIN_URL: `http://host.docker.internal:${upstreamPort}`, JELLYFIED_BASE_PATH: '/jellyfied/' }, async () => {
  const page = await text('/jellyfied/');
  check('serves the app under the path, pointing at it', page.includes('<base href="/jellyfied/"'));
  const redirect = await fetch(`${origin}/jellyfied`, { redirect: 'manual' });
  check('adds the trailing slash', redirect.status === 301 && redirect.headers.get('location') === '/jellyfied/');
  check('client-side routes work under the path', (await text('/jellyfied/item/abc')).includes('<div id="root">'));
  check(
    'config.js is served there and names the proxy under the path',
    (await text('/jellyfied/config.js')).includes('serverUrl: "/jellyfied/jellyfin"'),
  );
  const asset = /assets\/index-[\w-]+\.js/.exec(page)?.[0];
  check('build assets are served under the path', (await fetch(`${origin}/jellyfied/${asset}`)).status === 200);
  const proxied = await fetch(`${origin}/jellyfied/jellyfin/Users/Me`).then(
    (r) => r.json(),
    () => null,
  );
  check('the proxy works under the path', proxied?.url === '/Users/Me', JSON.stringify(proxied));
  check('WebSockets work under the path', (await webSocketPath('/jellyfied/jellyfin/socket?deviceId=d')) === '/socket?deviceId=d');
  check(
    'the SyncPlay picker answers under the path',
    (await fetch(`${origin}/jellyfied/jellyfied-api/syncplay/aaaaaaaabbbbccccddddeeeeeeeeeeee`)).status === 401,
  );
});

upstream.close();
upstream.closeAllConnections?.();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
