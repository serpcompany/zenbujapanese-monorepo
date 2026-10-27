export type Site =
  | { kind: 'restricted' }
  | { kind: 'no-access'; host: string; icon: string | null; origins: string[] }
  | { kind: 'open'; host: string; icon: string | null }

type Page = { host: string; origins: string[] }

type ActiveTab = { url?: string; favIconUrl?: string }

const webProtocols = ['http:', 'https:']

function isWebStore(url: URL): boolean {
  return (
    url.hostname === 'chromewebstore.google.com' ||
    (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore'))
  )
}

export function pageAt(address: string | undefined): Page | null {
  const url = address ? URL.parse(address) : null
  if (!url || !webProtocols.includes(url.protocol) || isWebStore(url)) return null
  return { host: url.hostname, origins: [`${url.protocol}//${url.hostname}/*`] }
}

function activeTab(): Promise<ActiveTab | undefined> {
  return chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => tab)
}

export async function readSite(): Promise<Site> {
  const tab = await activeTab()
  const page = pageAt(tab?.url)
  if (!page) return { kind: 'restricted' }
  const icon = tab?.favIconUrl || null
  const allowed = await chrome.permissions.contains({ origins: page.origins })
  return allowed
    ? { kind: 'open', host: page.host, icon }
    : { kind: 'no-access', host: page.host, icon, origins: page.origins }
}

export function allowSite(origins: string[]): Promise<boolean> {
  return chrome.permissions.request({ origins })
}
