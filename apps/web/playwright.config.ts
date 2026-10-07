import { defineConfig, devices } from '@playwright/test'

const closedProduction = process.env.E2E_SITE_ENV === 'production'
const onProductionBuild = process.env.E2E_SERVER === 'preview' || closedProduction
const port = closedProduction
  ? 8797
  : onProductionBuild
    ? 8787
    : Number(process.env.E2E_PORT ?? 3100)
const server = closedProduction
  ? `pnpm exec opennextjs-cloudflare preview --env production --port ${port} --var DICTIONARY_API_URL: --var DICTIONARY_API_TOKEN:`
  : onProductionBuild
    ? `pnpm exec opennextjs-cloudflare preview --port ${port}`
    : `pnpm exec next dev --port ${port}`
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`
const inCI = Boolean(process.env.CI)

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/results',
  fullyParallel: true,
  forbidOnly: inCI,
  retries: inCI ? 1 : 0,
  workers: onProductionBuild ? 1 : undefined,
  expect: { timeout: onProductionBuild ? 5_000 : 15_000 },
  reporter: inCI ? [['list'], ['html', { open: 'never', outputFolder: 'e2e/report' }]] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } }
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: server,
        env: { ZENBU_DICTIONARY_FIXTURES: '1' },
        url: `${baseURL}/`,
        reuseExistingServer: !inCI,
        timeout: 240_000
      }
})
