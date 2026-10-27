import { join } from 'node:path'
import { extensionId, sleep } from './chrome.mjs'
import { selftestExtension } from './paths.mjs'
import { findLines, proofFolder, runWithProof, writeProof } from './run.mjs'

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

const answerTimeoutMs = 10_000

async function pingOffscreenWorker(page) {
  return page.evaluate(async timeoutMs => {
    const ask = (message, context) =>
      Promise.race([
        chrome.runtime.sendMessage(message),
        new Promise(done =>
          setTimeout(
            () => done(`no answer from the ${context} in ${timeoutMs / 1000} s`),
            timeoutMs
          )
        )
      ])
    return {
      cold: await ask({ ping: 1 }, 'offscreen worker'),
      closed: await ask({ closeOffscreen: true }, 'service worker'),
      again: await ask({ ping: 2 }, 'offscreen worker, after the close')
    }
  }, answerTimeoutMs)
}

const expectedAnswers = { cold: 'pong 1', closed: 'closed', again: 'pong 2' }

function offscreenFailures(offscreen) {
  return Object.entries(expectedAnswers)
    .filter(([step, answer]) => offscreen[step] !== answer)
    .map(([step, answer]) => `${step}: expected ${answer}, got ${JSON.stringify(offscreen[step])}`)
}

async function drive({ browser, state }, result, folder) {
  const id = extensionId(state, selftestExtension)
  const page = await browser.newPage()
  await page.goto(standInUrl, { waitUntil: 'domcontentloaded' })
  await (await page.waitForSelector('#selftest-button', { visible: true, timeout: 10_000 })).click()
  result.video = await playMutedAndSeek(page)
  await page.screenshot({ path: join(folder, 'stand-in-watch-page.png') })
  await page.goto(`chrome-extension://${id}/popup.html`)
  await (await page.waitForSelector('#popup-button', { visible: true })).click()
  result.offscreen = await pingOffscreenWorker(page)
  await page.screenshot({ path: join(folder, 'popup.png') })
  await sleep(500)
}

export async function selftest({ headful = false, name } = {}) {
  const folder = proofFolder(name, 'agent-chrome-selftest')
  const { failures, result, lines } = await runWithProof(
    { headless: !headful, mapHost: ['www.youtube.com'], ext: [selftestExtension] },
    (context, result) => drive(context, result, folder)
  )
  if (result.video && !result.video.muted) failures.push('the stand-in video did not stay muted')
  if (result.offscreen) failures.push(...offscreenFailures(result.offscreen))
  const report = { folder, ...result, failures, lines: findLines(lines, expectedLines) }
  return { passed: writeProof(folder, { lines, report }), report }
}
