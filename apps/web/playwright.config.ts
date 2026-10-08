import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { onClosedProduction, onProductionBuild } from './e2e/server'
import { accountPagesFor } from './src/lib/account/availability'

process.env.ZENBU_ACCOUNT_PAGES = accountPagesFor(
  readFileSync(join(__dirname, 'wrangler.jsonc'), 'utf8'),
  onClosedProduction ? 'production' : process.env.SITE_ENV
)

const port = onClosedProduction
  ? 8797
  : onProductionBuild
    ? 8787
    : Number(process.env.E2E_PORT ?? 3100)
const server = onClosedProduction
  ? `./node_modules/.bin/wrangler dev --env production --port ${port} --env-file /dev/null --var DICTIONARY_API_URL: --var DICTIONARY_API_TOKEN:`
  : onProductionBuild
    ? `pnpm exec opennextjs-cloudflare preview --port ${port}`
    : `pnpm exec next dev --port ${port}`
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`
const inCI = Boolean(process.env.CI)

export default defineConfig({
  testDir: 'e2e',
  ...(onClosedProduction ? { testMatch: 'account-closed.spec.ts' } : {}),
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
        reuseExistingServer: !inCI && !onClosedProduction,
        timeout: 240_000
      }
})
