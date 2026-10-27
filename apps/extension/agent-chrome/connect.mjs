import puppeteer from 'puppeteer-core'
import { isAlive, readJson } from './files.mjs'
import { devtoolsPort, statePath } from './paths.mjs'

export function readState() {
  const state = readJson(statePath)
  return isAlive(state?.pid) ? state : null
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
