import { askPageHost } from '../shared/page-site'

export type Site =
  | { kind: 'cant-run' }
  | { kind: 'no-access'; host: string; origins: string[] }
  | { kind: 'open'; host: string }

type Page = { host: string; origins: string[] }

const cantRun: Site = { kind: 'cant-run' }

const webProtocols = ['http:', 'https:']

function isWebStore(url: URL): boolean {
  return (
    url.hostname === 'chromewebstore.google.com' ||
    (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore'))
  )
}

export function pageAt(address: string): Page | null {
  const url = URL.parse(address)
  if (!url || !webProtocols.includes(url.protocol) || isWebStore(url)) return null
  return { host: url.hostname, origins: [`${url.protocol}//${url.hostname}/*`] }
}

async function siteAt(address: string): Promise<Site> {
  const page = pageAt(address)
  if (!page) return cantRun
  const allowed = await chrome.permissions.contains({ origins: page.origins })
  return allowed
    ? { kind: 'open', host: page.host }
    : { kind: 'no-access', host: page.host, origins: page.origins }
}

export async function readActiveSite(): Promise<Site> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.url) return siteAt(tab.url)
  if (tab?.id === undefined) return cantRun
  const host = await askPageHost(tab.id)
  return host ? { kind: 'open', host } : cantRun
}

export function watchActiveTab(changed: () => void): () => void {
  const loaded = (_tabId: number, change: { status?: string }) => {
    if (change.status === 'complete') changed()
  }
  chrome.tabs.onActivated.addListener(changed)
  chrome.tabs.onUpdated.addListener(loaded)
  return () => {
    chrome.tabs.onActivated.removeListener(changed)
    chrome.tabs.onUpdated.removeListener(loaded)
  }
}

export function allowSite(origins: string[]): Promise<boolean> {
  return chrome.permissions.request({ origins })
}
