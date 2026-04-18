import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',
  timeout: 60_000,
  retries: 1,
  use: {
    headless: !!process.env.CI || process.env.PW_HEADLESS === '1',
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    screenshot: 'on',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },
  reporter: [['html', { open: 'never', outputFolder: 'playwright-report' }], ['list']],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
