import { join } from 'node:path'
import { extensionId, sleep } from './chrome.mjs'
import { selftestExtension } from './paths.mjs'
import { consoleLinesSince, findLines, proofFolder, withChrome, writeProof } from './run.mjs'

const standInUrl = 'https://www.youtube.com/watch?v=agent-chrome-selftest'

const expectedLines = [
  '[harness] opened page www.youtube.com/watch?v=agent-chrome-selftest',
  '[site] www.youtube.com/watch?v=agent-chrome-selftest -> index.html',
  '[selftest] service worker started',
  `[selftest] content script on ${standInUrl}`,
  '[selftest] service worker got content',
  '[selftest] content click answered',
  '[video] play currentTime=0.000 muted=true',
  '[video] seeking currentTime=1.000 muted=true',
  '[video] seeked currentTime=1.000 muted=true',
  '[video] pause',
  '[selftest] popup page loaded',
  '[selftest] service worker got popup',
  '[selftest] popup click answered',
  '[selftest] worker answered ping 1',
  '[selftest] offscreen document closed',
  '[selftest] worker answered ping 2'
]

async function playMutedAndSeek(page) {
  return page.evaluate(async () => {
    const video = document.querySelector('video')
    video.muted = true
    await video.play()
    const seeked = new Promise(done => video.addEventListener('seeked', done, { once: true }))
    video.currentTime = 1
    await seeked
    video.pause()
    return { muted: video.muted, currentTime: video.currentTime }
  })
}

async function pingOffscreenWorker(page) {
  return page.evaluate(async () => {
    const cold = await chrome.runtime.sendMessage({ ping: 1 })
    const closed = await chrome.runtime.sendMessage({ closeOffscreen: true })
    const again = await chrome.runtime.sendMessage({ ping: 2 })
    return { cold, closed, again }
  })
}

async function drive({ browser, state }, folder) {
  const id = extensionId(state, selftestExtension)
  const page = await browser.newPage()
  await page.goto(standInUrl, { waitUntil: 'domcontentloaded' })
  await (await page.waitForSelector('#selftest-button', { visible: true, timeout: 10_000 })).click()
  const video = await playMutedAndSeek(page)
  await page.screenshot({ path: join(folder, 'stand-in-watch-page.png') })
  await page.goto(`chrome-extension://${id}/popup.html`)
  await (await page.waitForSelector('#popup-button', { visible: true })).click()
  const offscreen = await pingOffscreenWorker(page)
  await page.screenshot({ path: join(folder, 'popup.png') })
  await sleep(500)
  return { video, offscreen }
}

export async function selftest({ headful = false, name } = {}) {
  const folder = proofFolder(name, 'agent-chrome-selftest')
  const failures = []
  const run = await withChrome(
    { headless: !headful, offline: true, mapHost: ['www.youtube.com'], ext: [selftestExtension] },
    context => drive(context, folder)
  )
  const { video, offscreen } = run.result
  if (!video.muted) failures.push('the stand-in video did not stay muted')
  if (offscreen.cold !== 'pong 1' || offscreen.again !== 'pong 2') {
    failures.push(`the offscreen worker answered ${JSON.stringify(offscreen)}`)
  }
  const lines = consoleLinesSince(run.state, run.since)
  const report = { folder, video, offscreen, failures, lines: findLines(lines, expectedLines) }
  return { passed: writeProof(folder, { lines, report }), report }
}
