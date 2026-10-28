import { stopPageLookup } from '../page-lookup/messages'
import { languageDataOrigin } from '../shared/hosts'
import type { FailureCode } from './router'

const pageScriptId = 'page-lookup'

const pageScriptFile = 'page-lookup.js'

const ownHosts = [`${languageDataOrigin}/*`, 'https://www.youtube.com/*']

type Granted = { origins?: string[] }

type PermissionEvent = { addListener(listener: (permissions: Granted) => void): void }

type PageScript = {
  id: string
  js: string[]
  matches: string[]
  runAt: 'document_idle'
  persistAcrossSessions: boolean
}

type OpenTab = { id?: number; url?: string }

export type PageScriptBrowser = {
  permissions: { getAll(): Promise<Granted>; onAdded: PermissionEvent; onRemoved: PermissionEvent }
  scripting: {
    getRegisteredContentScripts(filter: { ids: string[] }): Promise<{ id: string }[]>
    registerContentScripts(scripts: PageScript[]): Promise<void>
    updateContentScripts(scripts: PageScript[]): Promise<void>
    unregisterContentScripts(filter: { ids: string[] }): Promise<void>
    executeScript(injection: { target: { tabId: number }; files: string[] }): Promise<unknown>
  }
  tabs: {
    query(filter: { url?: string[] }): Promise<OpenTab[]>
    sendMessage(tabId: number, message: typeof stopPageLookup): Promise<unknown>
  }
}

export const pageOrigins = (granted: readonly string[]): string[] =>
  granted.filter(origin => !ownHosts.includes(origin))

async function register(browser: PageScriptBrowser): Promise<void> {
  const { origins = [] } = await browser.permissions.getAll()
  const matches = pageOrigins(origins)
  const ids = [pageScriptId]
  const registered = await browser.scripting.getRegisteredContentScripts({ ids })
  if (matches.length === 0) {
    if (registered.length > 0) await browser.scripting.unregisterContentScripts({ ids })
    return
  }
  const script: PageScript = {
    id: pageScriptId,
    js: [pageScriptFile],
    matches,
    runAt: 'document_idle',
    persistAcrossSessions: true
  }
  await (registered.length > 0
    ? browser.scripting.updateContentScripts([script])
    : browser.scripting.registerContentScripts([script]))
}

const eachTab = (tabs: OpenTab[], act: (tabId: number) => Promise<unknown>) =>
  Promise.all(tabs.flatMap(({ id }) => (id === undefined ? [] : [act(id).catch(() => undefined)])))

async function injectInto(browser: PageScriptBrowser, origins: string[]): Promise<void> {
  if (origins.length === 0) return
  await eachTab(await browser.tabs.query({ url: origins }), tabId =>
    browser.scripting.executeScript({ target: { tabId }, files: [pageScriptFile] })
  )
}

async function stopWithoutAccess(browser: PageScriptBrowser): Promise<void> {
  const hidden = (await browser.tabs.query({})).filter(tab => tab.url === undefined)
  await eachTab(hidden, tabId => browser.tabs.sendMessage(tabId, stopPageLookup))
}

export function keepPageScriptRegistered(
  browser: PageScriptBrowser,
  reportFailure: (code: FailureCode) => void
): Promise<void> {
  let queue = Promise.resolve()
  const after = (step: () => Promise<void>) => {
    queue = queue.then(step).catch(() => reportFailure('page-script'))
    return queue
  }
  browser.permissions.onAdded.addListener(({ origins = [] }) => {
    after(() => register(browser).then(() => injectInto(browser, pageOrigins(origins))))
  })
  browser.permissions.onRemoved.addListener(() => {
    after(() => register(browser).then(() => stopWithoutAccess(browser)))
  })
  return after(() => register(browser))
}
