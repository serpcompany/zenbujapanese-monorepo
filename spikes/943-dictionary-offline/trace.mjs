import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'
const dir = '/Users/devin/dev/repos/zenbujapanese-monorepo/.claude/worktrees/agent-a3c3e6179026cc9f7'
const variant = process.env.VARIANT ?? 'dist'
const browser = await puppeteer.launch({ executablePath: join(process.env.HOME, '.cache/puppeteer/chrome/mac_arm-153.0.8010.36/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'), headless: true, enableExtensions: true, pipe: true, userDataDir: join(dir, `tmp/agent/chrome-profile-${variant}`) })
const id = await browser.installExtension(join(dir, 'spikes/943-dictionary-offline', variant))
const page = await browser.newPage()
await page.goto(`chrome-extension://${id}/sidepanel.html`)
await page.waitForFunction(() => globalThis.spike)
for (;;) {
  try {
    await page.evaluate(() => spike.ensure().then(() => spike.ask('lookup', '水')))
    break
  } catch {
    await new Promise(r => setTimeout(r, 300))
  }
}
async function mem(label) {
  const offscreen = browser.targets().find(t => t.url().endsWith('/offscreen.html'))
  const op = await offscreen.asPage()
  await new Promise(r => setTimeout(r, 300))
  const worker = op.workers()[0]
  const heap = worker ? await worker.client.send('Runtime.getHeapUsage') : null
  const offscreenHeap = await op._client().send('Runtime.getHeapUsage').catch(() => null)
  const pid = browser.process().pid
  const lines = execFileSync('ps', ['-axo', 'pid,ppid,command']).toString().split('\n').filter(l => l.includes('--extension-process'))
  const ext = lines.map(l => l.trim().split(/\s+/)).filter(p => Number(p[1]) === pid).map(p => /Footprint:\s*([\d.]+\s*\w+)/.exec(execFileSync('footprint', ['-p', p[0]]).toString())?.[1])
  console.log('MEM', label, JSON.stringify({ workerHeapMB: heap && Math.round(heap.usedSize / 1e6), offscreenHeapMB: offscreenHeap && Math.round(offscreenHeap.usedSize / 1e6), extensionFootprint: ext }))
}
if (process.env.MEM) await mem('opened')
const words = (process.env.WORDS ?? '食べる,で,経済,行きました').split(',')
for (const w of words.filter(w => w !== 'SKIP')) console.log(w, JSON.stringify(await page.evaluate(w => spike.ask('traceLookup', w), w), null, 1))
if (process.env.BENCH) {
  const { readFileSync } = await import('node:fs')
  const list = JSON.parse(readFileSync(new URL('./src/bench.ts', import.meta.url), 'utf8').match(/words = (\[[\s\S]*?\])/)[1].replaceAll("'", '"'))
  for (const mode of (process.env.MODES ?? 'search,searchResults,segment,segmentThenWord').split(',')) console.log(JSON.stringify(await page.evaluate((words, mode) => spike.ask('benchCore', { words, mode }), list, mode)))
}
if (process.env.MEM) await mem('after ' + (process.env.MODES ?? 'all modes'))
if (process.env.SQL) console.log(JSON.stringify(await page.evaluate(sql => spike.ask('sql', sql), process.env.SQL), null, 1))
await browser.close()
