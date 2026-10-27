export type Site =
  | { kind: 'unseen' }
  | { kind: 'cant-run' }
  | { kind: 'no-access'; host: string; origins: string[] }
  | { kind: 'open'; host: string }

type Page = { host: string; origins: string[] }

const cantRun: Site = { kind: 'cant-run' }

export const unseen: Site = { kind: 'unseen' }

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
  return tab?.url ? siteAt(tab.url) : unseen
}

export function watchActiveSite(changed: () => void): () => void {
  const loaded = (_tabId: number, change: { status?: string }) => {
    if (change.status === 'complete') changed()
  }
  chrome.tabs.onActivated.addListener(changed)
  chrome.tabs.onUpdated.addListener(loaded)
  chrome.permissions.onAdded.addListener(changed)
  chrome.permissions.onRemoved.addListener(changed)
  return () => {
    chrome.tabs.onActivated.removeListener(changed)
    chrome.tabs.onUpdated.removeListener(loaded)
    chrome.permissions.onAdded.removeListener(changed)
    chrome.permissions.onRemoved.removeListener(changed)
  }
}

export function allowSite(origins: string[]): Promise<boolean> {
  return chrome.permissions.request({ origins })
}
