import { defineConfig } from '@playwright/test'

const inCI = Boolean(process.env.CI)

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/results',
  forbidOnly: inCI,
  retries: 0,
  workers: 1,
  expect: { timeout: 15_000 },
  reporter: inCI ? [['list'], ['html', { open: 'never', outputFolder: 'e2e/report' }]] : [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
})
