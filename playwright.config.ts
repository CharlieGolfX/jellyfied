import { defineConfig, devices } from '@playwright/test';

// By default the tests build Jellyplex and serve it with `vite preview`. Set E2E_BASE_URL to test
// a running instance instead (for example the container on http://localhost:8080).
const externalUrl = process.env.E2E_BASE_URL;
const port = 4173;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: externalUrl ?? `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: externalUrl
    ? undefined
    : {
        command: `npm run build && npm run preview -- --port ${port} --strictPort`,
        url: `http://localhost:${port}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
