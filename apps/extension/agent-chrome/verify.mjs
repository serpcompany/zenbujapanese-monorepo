import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import {
  checkedReleaseFile,
  dictionaryLabels,
  downloadReleaseFile,
  extensionPages,
  releaseCheckFailures,
  testPage
} from '../e2e/expected.ts'
import { startLocalServer } from '../e2e/local-server.ts'
import { extensionId } from './chrome.mjs'
import { extensionRoot } from './paths.mjs'
import { findLines, proofFolder, runWithProof, serviceWorkerOf, writeProof } from './run.mjs'

const build = join(extensionRoot, 'dist-test')
const text = value => `::-p-text(${value})`

async function screenshotBothThemes(page, folder, name) {
  for (const scheme of ['light', 'dark']) {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }])
    await page.screenshot({ path: join(folder, `${name}-${scheme}.png`), fullPage: true })
  }
}

async function openPages(browser, id, folder, failures) {
  const page = await browser.newPage()
  for (const expected of extensionPages) {
    try {
      const response = await page.goto(`chrome-extension://${id}/${expected.path}`)
      if (!response?.ok()) throw new Error(`answered ${response?.status()}`)
      await page.waitForSelector(text(expected.text), { visible: true, timeout: 15_000 })
      await screenshotBothThemes(page, folder, expected.name)
    } catch (error) {
      failures.push(`${expected.path}: ${error.message}`)
    }
  }
  return page
}

async function checkAfterOffscreenCloses(browser, id, page, server, folder) {
  await page.goto(`${server.url}${testPage}`)
  await page.waitForSelector(text(dictionaryLabels.ready), { visible: true, timeout: 15_000 })
  const worker = await serviceWorkerOf(browser, id)
  await worker.evaluate(() => chrome.offscreen.closeDocument())
  await page.locator(text(dictionaryLabels.checkAgain)).click()
  await page.waitForSelector(text(dictionaryLabels.ready), { visible: true, timeout: 15_000 })
  await page.screenshot({ path: join(folder, 'test-surface-after-offscreen-closed.png') })
}

async function checkContentScript(page, server, folder) {
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
  await page.goto(`${server.url}${testPage}`)
  await page.waitForSelector(text('食べる'), { visible: true, timeout: 15_000 })
  await page.waitForSelector(text(dictionaryLabels.ready), { visible: true, timeout: 15_000 })
  await page.screenshot({ path: join(folder, 'content-script-test-page.png'), fullPage: true })
}

async function checkLanguageData(page, id, server) {
  await page.goto(`chrome-extension://${id}/pages/settings.html`)
  return page.evaluate(downloadReleaseFile, {
    base: server.languageDataUrl,
    release: server.release,
    name: checkedReleaseFile
  })
}

async function drive({ browser, state }, result, failures, server, folder) {
  const id = extensionId(state, build)
  result.id = id
  const page = await openPages(browser, id, folder, failures)
  const steps = {
    offscreen: () => checkAfterOffscreenCloses(browser, id, page, server, folder),
    contentScript: () => checkContentScript(page, server, folder),
    languageData: () => checkLanguageData(page, id, server)
  }
  const results = {}
  result.results = results
  for (const [name, step] of Object.entries(steps)) {
    try {
      results[name] = (await step()) ?? 'passed'
    } catch (error) {
      failures.push(`${name}: ${error.message}`)
    }
  }
}

function expectedLines(id, server) {
  const host = new URL(server.url).host
  return [
    ...extensionPages.map(page => `[harness] opened page ${id}/${page.path}`),
    `[harness] attached sw ${id}/service-worker.js`,
    `[harness] attached background_page ${id}/offscreen/offscreen.html`,
    `[harness] opened page ${host}${testPage}`
  ]
}

export async function verifyExtension({ name, skipBuild = false } = {}) {
  if (!skipBuild) {
    const built = spawnSync('pnpm', ['build:test'], { cwd: extensionRoot, stdio: 'inherit' })
    if (built.status !== 0) throw new Error('pnpm build:test failed')
  }
  const folder = proofFolder(name, 'extension')
  const server = await startLocalServer()
  try {
    const { failures, result, lines } = await runWithProof(
      { headless: true, ext: [build], hostRule: [server.hostRule] },
      (context, result, failures) => drive(context, result, failures, server, folder)
    )
    const languageData = result.results?.languageData
    if (languageData) failures.push(...releaseCheckFailures(languageData))
    const report = {
      folder,
      ...result,
      failures,
      lines: findLines(lines, expectedLines(result.id, server))
    }
    return { passed: writeProof(folder, { lines, report }), report }
  } finally {
    await server.close()
  }
}
