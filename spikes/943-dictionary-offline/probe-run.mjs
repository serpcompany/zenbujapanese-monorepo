import { rmSync } from 'node:fs'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'

const dir = join(import.meta.dirname, '../..')
const variant = process.env.VARIANT ?? 'dist-fts4'
const profile = join(dir, 'tmp/agent/chrome-profile-probe')
rmSync(profile, { recursive: true, force: true })
const browser = await puppeteer.launch({ executablePath: join(process.env.HOME, '.cache/puppeteer/chrome/mac_arm-153.0.8010.36/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'), headless: true, enableExtensions: true, pipe: true, userDataDir: profile })
const id = await browser.installExtension(join(import.meta.dirname, variant))
const page = await browser.newPage()
await page.goto(`chrome-extension://${id}/probe.html`)
for (let i = 0; i < 20; i++) {
  await new Promise(r => setTimeout(r, 1000))
  const log = await page.evaluate(() => globalThis.probeLog)
  if (i === 19 || log.some(l => l.step === 'done' || l.step === 'error')) {
    console.log(variant, JSON.stringify(log, null, 1).slice(0, 3000))
    break
  }
}
await browser.close()
