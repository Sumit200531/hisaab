import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run the production build (with its service worker) and the
 * real sync relay. `npm run test:e2e` builds and starts both.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Pixel 7'],
    baseURL: 'http://127.0.0.1:4174',
    locale: 'hi-IN',
    trace: 'retain-on-failure'
  },
  webServer: [
    { command: 'npm run dev -w @hisaab/server', url: 'http://127.0.0.1:8788/health', reuseExistingServer: true, timeout: 60_000, env: { PORT: '8788', LOG_LEVEL: 'silent' } },
    { command: 'npm run build -w @hisaab/web && npm run preview -w @hisaab/web -- --host 127.0.0.1 --port 4174 --strictPort', url: 'http://127.0.0.1:4174', reuseExistingServer: true, timeout: 120_000 }
  ]
});
