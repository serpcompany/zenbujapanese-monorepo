import { join } from 'node:path'
import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({ executablePath: join(process.env.HOME, '.cache/puppeteer/chrome/mac_arm-153.0.8010.36/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'), headless: true, pipe: true, userDataDir: join(import.meta.dirname, '../../tmp/agent/chrome-profile-formats') })
const page = await browser.newPage()
await page.goto('http://localhost:8943/page.html')
console.log(await browser.version(), JSON.stringify(await page.evaluate(() => Object.fromEntries(['gzip', 'deflate', 'deflate-raw', 'brotli', 'br', 'zstd'].map(format => {
  try {
    new DecompressionStream(format)
    return [format, true]
  } catch {
    return [format, false]
  }
})))))
await browser.close()
