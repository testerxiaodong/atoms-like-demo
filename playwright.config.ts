import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: ['e2e/**/*.spec.ts', 'http/**/*.spec.ts'],
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: process.env.CLOUD_TEST_URL ? 180_000 : 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:3001', trace: process.env.CLOUD_TEST_URL ? 'off' : 'retain-on-failure', screenshot: 'only-on-failure', ...devices['Desktop Chrome'] },
  webServer: { command: 'npm run test:e2e:serve', url: 'http://localhost:3001', reuseExistingServer: false, timeout: 120_000 },
});
