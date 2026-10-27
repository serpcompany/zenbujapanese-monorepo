import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { startChrome, stopChrome } from './chrome.mjs'
import { connect } from './connect.mjs'
import { verifyRoot } from './paths.mjs'

export function proofFolder(name, what) {
  const today = new Date().toISOString().slice(0, 10)
  const folder = join(verifyRoot, name ?? `${today}-${what}`)
  mkdirSync(folder, { recursive: true })
  return folder
}

export async function withChrome(options, drive) {
  const since = new Date().toISOString()
  const state = await startChrome(options)
  let browser
  try {
    browser = (await connect()).browser
    return { since, state, result: await drive({ browser, state }) }
  } finally {
    await browser?.disconnect().catch(() => {})
    await stopChrome()
  }
}

export function consoleLinesSince(state, since) {
  return readFileSync(state.consoleLog, 'utf8')
    .split('\n')
    .filter(line => line && line.slice(0, 24) >= since)
}

export function findLines(lines, expected) {
  return Object.fromEntries(
    expected.map(text => [
      text,
      lines.find(line => line.includes(text))?.replace(/^\S+ /, '') ?? 'MISSING'
    ])
  )
}

export function writeProof(folder, { lines, report }) {
  writeFileSync(join(folder, 'console.log'), `${lines.join('\n')}\n`)
  writeFileSync(join(folder, 'run.json'), `${JSON.stringify(report, null, 2)}\n`)
  const missing = Object.entries(report.lines ?? {}).filter(([, line]) => line === 'MISSING')
  return missing.length === 0 && report.failures.length === 0
}

export async function serviceWorkerOf(browser, id) {
  const target = await browser.waitForTarget(
    t => t.type() === 'service_worker' && t.url().startsWith(`chrome-extension://${id}/`)
  )
  return target.worker()
}
