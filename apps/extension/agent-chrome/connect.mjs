import { existsSync, readFileSync } from 'node:fs'
import puppeteer from 'puppeteer-core'
import { devtoolsPort, statePath } from './paths.mjs'

export function readState() {
  if (!existsSync(statePath)) return null
  const state = JSON.parse(readFileSync(statePath, 'utf8'))
  try {
    process.kill(state.pid, 0)
    return state
  } catch {
    return null
  }
}

export async function chromeOnDevtoolsPort() {
  try {
    const response = await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`, {
      signal: AbortSignal.timeout(1000)
    })
    return (await response.json()).Browser ?? 'unknown'
  } catch {
    return null
  }
}

export async function connect() {
  const state = readState()
  if (!state) throw new Error('agent Chrome is not running: node ctl.mjs start')
  const browser = await puppeteer.connect({ browserURL: state.browserURL, defaultViewport: null })
  async function page(match) {
    const pages = (await browser.pages()).filter(p => !p.url().startsWith('devtools://'))
    if (match) {
      const found = pages.find(p => p.url().includes(match))
      if (!found) throw new Error(`no page whose URL contains ${match}`)
      return found
    }
    return pages.at(-1) ?? browser.newPage()
  }
  return { browser, state, page }
}
