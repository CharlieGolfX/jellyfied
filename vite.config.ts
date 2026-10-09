import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// In development, set JELLYFIN_URL (e.g. in .env.local) to proxy /jellyfin to a
// Jellyfin server, mirroring what the nginx container does in production.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.JELLYFIN_URL;

  return {
    base: '/',
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
      port: 5173,
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
  };
});
