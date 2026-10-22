import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'

const dir = join(import.meta.dirname, '../..')
const results = {}
for (const withPermission of [false, true]) {
  const out = join(dir, 'tmp/agent', `ext-cors-${withPermission}`)
  rmSync(out, { recursive: true, force: true })
  cpSync(join(import.meta.dirname, 'dist'), out, { recursive: true })
  const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'))
  manifest.content_scripts[0].matches = ['http://localhost:8943/*']
  if (withPermission) manifest.host_permissions.push('https://cdn.zenbujapanese.com/*')
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2))
  const profile = join(dir, 'tmp/agent/chrome-profile-cors')
  rmSync(profile, { recursive: true, force: true })
  const browser = await puppeteer.launch({ executablePath: join(process.env.HOME, '.cache/puppeteer/chrome/mac_arm-153.0.8010.36/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'), headless: true, enableExtensions: true, pipe: true, userDataDir: profile })
  const id = await browser.installExtension(out)
  const page = await browser.newPage()
  await page.goto(`chrome-extension://${id}/probe.html`)
  await page.waitForFunction(() => globalThis.probeFetch)
  await page.waitForFunction(() => globalThis.probeLog.some(l => l.step === 'done'), { timeout: 20000 })
  results[withPermission ? 'withHostPermission' : 'withoutHostPermission'] = { page: await page.evaluate(() => globalThis.probeFetch()), worker: await page.evaluate(() => globalThis.probeWorkerFetch()) }
  await browser.close()
}
console.log(JSON.stringify(results))
