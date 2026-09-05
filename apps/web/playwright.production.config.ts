import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests-production',
  outputDir: './test-results-production',
  use: { baseURL: 'http://127.0.0.1:3301' },
  projects: [
    { name: 'desktop', use: devices['Desktop Chrome'] },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
  ],
  webServer: {
    command: 'pnpm start --port 3301',
    url: 'http://127.0.0.1:3301',
    timeout: 60000,
    reuseExistingServer: false,
  },
});
