import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import puppeteer from 'puppeteer-core'

const repo = resolve(import.meta.dirname, '../..')
const variant = process.env.VARIANT ?? 'dist'
const compressed = process.env.COMPRESSED === '1'
const resumeAt = process.env.RESUME ? Number(process.env.RESUME) : undefined
const label = process.env.LABEL ?? `${variant}${compressed ? '-gz' : ''}${resumeAt ? '-resume' : ''}`
const executablePath = process.env.CHROME ?? join(process.env.HOME, '.cache/puppeteer/chrome/mac_arm-153.0.8010.36/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')
const profile = join(repo, 'tmp/agent', `chrome-profile-${label}`)
const outDir = join(repo, 'tmp/agent/results')
mkdirSync(outDir, { recursive: true })
if (process.env.KEEP_PROFILE !== '1') rmSync(profile, { recursive: true, force: true })
const result = { label, chrome: executablePath.split('/').slice(-6, -5)[0], compressed }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const served = async () => Number(await (await fetch('http://localhost:8943/served')).text())

const launch = () => puppeteer.launch({ executablePath, headless: process.env.HEADFUL !== '1', enableExtensions: true, pipe: true, userDataDir: profile, args: ['--no-first-run', '--no-default-browser-check'] })

let browser = await launch()
result.chromeVersion = await browser.version()
const served0 = await served()
const t0 = performance.now()
const id = await browser.installExtension(join(import.meta.dirname, variant))
const panelUrl = `chrome-extension://${id}/sidepanel.html`

async function panel() {
  const page = await browser.newPage()
  await page.goto(panelUrl)
  await page.waitForFunction(() => globalThis.spike)
  return page
}

async function prepare(page) {
  await page.evaluate((compressed, stopAfter) => spike.local({ compressed, stopAfter }), compressed, resumeAt ?? null)
}

let side = await panel()

async function firstLookup(page, since) {
  for (;;) {
    const answer = await page.evaluate(async () => {
      try {
        await spike.ensure()
        return await spike.ask('lookup', '食べる')
      } catch (error) {
        return { error: String(error) }
      }
    })
    if (answer && !answer.error) return { ms: Math.round(performance.now() - since), answer }
    if (performance.now() - since > 20 * 60_000) throw new Error('no lookup in 20 minutes')
    await sleep(200)
  }
}

if (resumeAt) {
  for (;;) {
    const session = await side.evaluate(() => spike.session())
    if (session.setUp || (await served()) - served0 >= resumeAt) break
    await sleep(200)
  }
  await sleep(1000)
  result.servedBeforeResume = (await served()) - served0
  await browser.close()
  result.closedAtMs = Math.round(performance.now() - t0)
  browser = await launch()
  await browser.installExtension(join(import.meta.dirname, variant))
  side = await panel()
}

const first = await firstLookup(side, t0)
result.timeToFirstLookupMs = first.ms
result.firstLookup = first.answer.first
result.servedBytes = (await served()) - served0
result.setUp = (await side.evaluate(() => spike.session())).setUp
result.workerTimings = await side.evaluate(() => spike.ask('timings'))

const page = await browser.newPage()
await page.goto('http://localhost:8943/page.html')
await page.waitForFunction(() => document.documentElement.dataset.zenbuContent === 'ready')
await page.evaluate(() => window.dispatchEvent(new Event('zenbu-spike-bench')))
await page.waitForFunction(() => document.documentElement.dataset.zenbuBench, { timeout: 120_000 })
result.contentScript = JSON.parse(await page.evaluate(() => document.documentElement.dataset.zenbuBench))
const box = await page.$eval('#s1', el => {
  const r = el.getBoundingClientRect()
  return { x: r.left + 120, y: r.top + r.height / 2 }
})
await page.mouse.click(box.x, box.y)
await page.waitForFunction(() => document.getElementById('zenbu-spike-popup')?.style.display === 'block')
result.wordPopup = await page.$eval('#zenbu-spike-popup', el => ({ text: el.textContent, ms: Number(el.dataset.ms) }))
await page.screenshot({ path: join(outDir, `${label}-popup.png`) })

result.sidePanel = await side.evaluate(() => spike.bench())
result.sidePanelSecondPass = (await side.evaluate(() => spike.bench())).bench
result.wordDetail = await side.evaluate(async () => {
  const times = []
  for (const sample of (await spike.bench()).bench.samples) {
    if (!sample.first) continue
    const answer = await spike.ask('word', sample.first.entSeq)
    times.push(answer.ms)
  }
  times.sort((a, b) => a - b)
  const at = p => times[Math.min(times.length - 1, Math.ceil(p * times.length) - 1)]
  return { n: times.length, median: at(0.5), p95: at(0.95), max: times[times.length - 1] }
})
result.afterResetCaches = (await side.evaluate(async () => { await spike.ask('resetCaches'); return spike.bench() })).bench
delete result.afterResetCaches.samples
result.ftsProbe = await side.evaluate(() => spike.ask('ftsProbe'))
result.storage = await side.evaluate(() => spike.ask('storage'))
result.englishAndRomaji = await side.evaluate(async () => {
  const out = []
  for (const word of ['eat', 'study', 'beautiful', 'economy', 'taberu', 'benkyou']) {
    try {
      const answer = await spike.ask('lookup', word)
      out.push({ word, ms: Math.round(answer.ms * 10) / 10, first: answer.first?.headword, count: answer.count })
    } catch (error) {
      out.push({ word, error: String(error).slice(0, 120) })
    }
  }
  return out
})

async function contentBench() {
  const page = await browser.newPage()
  await page.goto('http://localhost:8943/page.html')
  await page.waitForFunction(() => document.documentElement.dataset.zenbuContent === 'ready')
  await page.evaluate(() => window.dispatchEvent(new Event('zenbu-spike-bench')))
  await page.waitForFunction(() => document.documentElement.dataset.zenbuBench, { timeout: 120_000 })
  const out = JSON.parse(await page.evaluate(() => document.documentElement.dataset.zenbuBench))
  delete out.bench?.samples
  return out
}

async function offscreenHeap() {
  const target = browser.targets().find(t => t.url().endsWith('/offscreen.html'))
  if (!target) return null
  const session = await target.createCDPSession()
  return session.send('Runtime.getHeapUsage')
}

function processMemory() {
  const pid = browser.process()?.pid
  const processes = execFileSync('ps', ['-axo', 'pid,ppid,rss,command']).toString().split('\n').slice(1).filter(Boolean).map(line => {
    const [p, pp, rss, ...rest] = line.trim().split(/\s+/)
    return { pid: Number(p), ppid: Number(pp), rssMB: Math.round(Number(rss) / 1024), command: rest.join(' ') }
  })
  const children = processes.filter(p => p.ppid === pid || p.pid === pid)
  const out = children.map(p => ({ pid: p.pid, rssMB: p.rssMB, type: /--type=(\S+)/.exec(p.command)?.[1] ?? 'browser', extension: p.command.includes('--extension-process') }))
  for (const p of out) {
    try {
      const footprint = execFileSync('footprint', ['-p', String(p.pid)], { stdio: ['ignore', 'pipe', 'ignore'] }).toString()
      p.footprint = /Footprint:\s*([\d.]+\s*\w+)/.exec(footprint)?.[1] ?? null
    } catch {}
  }
  return out
}

result.afterInstall = { workerMemory: await side.evaluate(() => spike.ask('memory')), offscreenHeap: await offscreenHeap(), processes: processMemory() }
writeFileSync(join(outDir, `${label}.json`), JSON.stringify(result, null, 2))
await browser.close()

const t1 = performance.now()
browser = await launch()
result.restartExtensionId = await browser.installExtension(join(import.meta.dirname, variant))
side = await panel()
const restart = await firstLookup(side, t1)
result.afterBrowserRestart = { timeToFirstLookupMs: restart.ms, workerTimings: await side.evaluate(() => spike.ask('timings')) }
result.afterBrowserRestart.memoryBeforeLookups = { workerMemory: await side.evaluate(() => spike.ask('memory')), offscreenHeap: await offscreenHeap(), processes: processMemory() }
result.afterBrowserRestart.contentScript = await contentBench()
result.afterBrowserRestart.memoryAfterLookups = { workerMemory: await side.evaluate(() => spike.ask('memory')), offscreenHeap: await offscreenHeap(), processes: processMemory() }
await browser.close()

writeFileSync(join(outDir, `${label}.json`), JSON.stringify(result, null, 2))
const ext = m => m.processes.filter(p => p.extension).map(p => p.footprint)
console.log(JSON.stringify({ label, timeToFirstLookupMs: result.timeToFirstLookupMs, servedMB: Math.round(result.servedBytes / 1e6), content: result.contentScript.bench?.inWorker, contentRoundTrip: result.contentScript.bench?.roundTrip, afterReset: result.afterResetCaches.inWorker, popup: result.wordPopup, fts: result.ftsProbe, english: result.englishAndRomaji, restart: result.afterBrowserRestart.timeToFirstLookupMs, restartContent: result.afterBrowserRestart.contentScript.bench?.inWorker, extFootprintInstall: ext(result.afterInstall), extFootprintRestartBefore: ext(result.afterBrowserRestart.memoryBeforeLookups), extFootprintRestartAfter: ext(result.afterBrowserRestart.memoryAfterLookups), worker: result.afterBrowserRestart.memoryAfterLookups.workerMemory }, null, 1))
