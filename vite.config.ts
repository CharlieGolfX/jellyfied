import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
// @ts-expect-error -- a plain script without type declarations
import { thirdPartyNotices } from './scripts/third-party-notices.mjs';
// @ts-expect-error -- plain JavaScript for nginx, without type declarations
import picker from './docker/syncplay-picker.js';
// @ts-expect-error -- plain JavaScript for nginx, without type declarations
import statsCompare from './docker/stats-compare.js';
import { createHash } from 'node:crypto';

/** A request body, as nginx's njs reads it: a body that isn't JSON counts as an empty one. */
function readJson(raw: string): unknown {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// In development, /jellyfin is proxied to the Jellyfin server from .env (JELLYFIN_DEV_URL, or
// JELLYFIN_URL when that is empty), mirroring what the nginx container does in production.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.JELLYFIN_DEV_URL || env.JELLYFIN_URL;
  const port = Number(env.JELLYFIED_DEV_PORT) || 5173;

  return {
    // Relative, so the same build can be served at the root or under a path (see index.html's <base>).
    base: './',
    define: { __APP_VERSION__: JSON.stringify(version) },
    plugins: [
      react(),
      tailwindcss(),
      {
        // Mirror the container's runtime config so the dev server uses the /jellyfin proxy.
        name: 'jellyfied-dev-config',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use('/config.js', (_req, res) => {
            res.setHeader('Content-Type', 'application/javascript');
            res.end(`window.JELLYFIED_CONFIG = ${JSON.stringify({ serverUrl: target ? '/jellyfin' : '', lockServer: false })};`);
          });
        },
      },
      {
        // The SyncPlay picker, which the container answers with njs: here, the same code with the
        // state in this process's memory, asking the Jellyfin server from .env.
        name: 'jellyfied-dev-picker',
        apply: 'serve',
        configureServer(server) {
          const map = new Map<string, string>();
          const store = {
            get: (k: string) => map.get(k),
            set: (k: string, v: string) => void map.set(k, v),
            add: (k: string, v: string) => (map.has(k) ? false : (map.set(k, v), true)),
            keys: () => [...map.keys()],
          };
          server.middlewares.use('/jellyfied-api/syncplay/', (req, res) => {
            const send = (status: number, body: unknown) => {
              res.statusCode = status;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(body));
            };
            if (!target) return send(404, { code: 'notAvailable', error: 'Not available' });
            const ask = async (path: string) => {
              const r = await fetch(target.replace(/\/+$/, '') + path, { headers: { Authorization: req.headers.authorization ?? '' } });
              return r.ok ? r.json() : null;
            };
            let raw = '';
            req.on('data', (chunk) => (raw += chunk));
            req.on('end', () => {
              void picker
                .handle({
                  store,
                  method: req.method,
                  groupId: (req.url ?? '').replace(/^\//, '').split('?')[0],
                  body: req.method === 'POST' ? readJson(raw) : null,
                  jellyfin: {
                    me: () => ask('/Users/Me'),
                    group: (id: string) => ask(`/SyncPlay/${id}`),
                    item: (id: string) => ask(`/Items/${id}`),
                  },
                })
                .then(
                  (r: { status: number; body: unknown }) => send(r.status, r.body),
                  () => send(500, { code: 'failed', error: 'Failed' }),
                );
            });
          });
        },
      },
      {
        // Your stats compared with others, which the container answers with njs: the same code here,
        // with the summaries in this process's memory.
        name: 'jellyfied-dev-stats',
        apply: 'serve',
        configureServer(server) {
          const map = new Map<string, string>();
          const store = {
            get: (k: string) => map.get(k),
            set: (k: string, v: string) => void map.set(k, v),
            del: (k: string) => void map.delete(k),
            keys: () => [...map.keys()],
          };
          server.middlewares.use('/jellyfied-api/stats', (req, res) => {
            const send = (status: number, body: unknown) => {
              res.statusCode = status;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(body));
            };
            if (!target) return send(404, { code: 'notAvailable', error: 'Not available' });
            let raw = '';
            req.on('data', (chunk) => (raw += chunk));
            req.on('end', () => {
              void statsCompare
                .handle({
                  store,
                  method: req.method,
                  range: new URL(req.url ?? '/', 'http://x').searchParams.get('range'),
                  body: req.method === 'POST' ? readJson(raw) : null,
                  minUsers: Number(env.JELLYFIED_STATS_MIN_USERS) || 3,
                  hash: (id: string) =>
                    createHash('sha256')
                      .update('jellyfied-stats:' + id)
                      .digest('hex'),
                  jellyfin: {
                    me: async () => {
                      const r = await fetch(target.replace(/\/+$/, '') + '/Users/Me', {
                        headers: { Authorization: req.headers.authorization ?? '' },
                      });
                      return r.ok ? r.json() : null;
                    },
                  },
                })
                .then(
                  (r: { status: number; body: unknown }) => send(r.status, r.body),
                  () => send(500, { code: 'failed', error: 'Failed' }),
                );
            });
          });
        },
      },
      {
        // licenses.txt: Jellyfied's licence and the notices of everything shipped with it. The app
        // links to it, so it is there in development as well.
        name: 'jellyfied-licences',
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'licenses.txt', source: thirdPartyNotices() as string });
        },
        configureServer(server) {
          server.middlewares.use('/licenses.txt', (_req, res) => {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end(thirdPartyNotices() as string);
          });
        },
      },
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port,
      proxy: target
        ? {
            '/jellyfin': {
              target,
              changeOrigin: true,
              ws: true,
              rewrite: (p) => p.replace(/^\/jellyfin/, ''),
            },
          }
        : undefined,
    },
    build: {
      // hls.js is the one large piece (about 575 kB before compression). It is imported on demand,
      // when the server sends a stream that needs it, which also puts it in a file of its own.
      // Everything else stays under the usual 500 kB warning.
      chunkSizeWarningLimit: 600,
    },
    // The subtitle renderer finds its worker and WebAssembly files next to its own module, which
    // only works when the dev server leaves the package as it is.
    optimizeDeps: { exclude: ['jassub'] },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts', 'docker/**/*.test.ts'],
      setupFiles: ['src/test/setup.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts', 'src/api/generated.ts', 'src/test/**'],
        reporter: ['text-summary', 'html', 'json-summary'],
        reportsDirectory: 'coverage',
        // A floor, a little under what the tests reach today: the run fails when coverage drops
        // below it. Raise it when tests are added.
        thresholds: { lines: 45, statements: 44, functions: 31, branches: 36 },
      },
    },
  };
});
