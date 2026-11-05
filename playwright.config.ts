import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:3180',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3180',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    // Force all login methods for e2e regardless of the local .env value
    // (shell env wins over .env in Next). Tests rely on the PIN grid + the
    // "Sign in with WEHA account" switch link.
    env: { NEXT_PUBLIC_LOGIN_METHOD: 'all' },
  },
  outputDir: 'tests/e2e/screenshots',
});
