import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// In development, /jellyfin is proxied to the Jellyfin server from .env (JELLYFIN_DEV_URL, or
// JELLYFIN_URL when that is empty), mirroring what the nginx container does in production.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.JELLYFIN_DEV_URL || env.JELLYFIN_URL;
  const port = Number(env.JELLYPLEX_DEV_PORT) || 5173;

  return {
    base: '/',
    define: { __APP_VERSION__: JSON.stringify(version) },
    plugins: [
      react(),
      tailwindcss(),
      {
        // Mirror the container's runtime config so the dev server uses the /jellyfin proxy.
        name: 'jellyplex-dev-config',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use('/config.js', (_req, res) => {
            res.setHeader('Content-Type', 'application/javascript');
            res.end(`window.JELLYPLEX_CONFIG = ${JSON.stringify({ serverUrl: target ? '/jellyfin' : '', lockServer: false })};`);
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
      chunkSizeWarningLimit: 1200,
    },
    // The subtitle renderer finds its worker and WebAssembly files next to its own module, which
    // only works when the dev server leaves the package as it is.
    optimizeDeps: { exclude: ['jassub'] },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
