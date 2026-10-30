import { fields } from '../shared/messages'

export const pagePopupPort = 'word-popup'

export type PanelSide = 'left' | 'right'

export type PagePopupRequest = {
  text: string
  ids: readonly string[]
  fromBottom: number
  side: PanelSide
}

export type ShowOnPage = { target: 'word-popup'; show: PagePopupRequest }

export type ShownOnPage = { target: 'word-popup'; shown: true }

export type PagePopupHeard = {
  shown(): void
  closed(): void
  unavailable(): void
}

export type PagePopup = (word: Omit<PagePopupRequest, 'side'>, heard: PagePopupHeard) => () => void

type PortEvent<Listener> = { addListener(listener: Listener): void }

export type PagePopupPort = {
  readonly name: string
  postMessage(message: ShowOnPage | ShownOnPage): void
  disconnect(): void
  onMessage: PortEvent<(message: unknown) => void>
  onDisconnect: PortEvent<() => void>
}

const isSide = (value: unknown): value is PanelSide => value === 'left' || value === 'right'

export function shownRequest(message: unknown): PagePopupRequest | null {
  const envelope = fields(message)
  const show = fields(envelope?.show)
  if (envelope?.target !== 'word-popup' || !show) return null
  const { text, ids, fromBottom, side } = show
  if (typeof text !== 'string' || !Array.isArray(ids) || !isSide(side)) return null
  if (!ids.every(id => typeof id === 'string') || !Number.isFinite(fromBottom)) return null
  return { text, ids, fromBottom: fromBottom as number, side }
}

const isShown = (message: unknown) => {
  const envelope = fields(message)
  return envelope?.target === 'word-popup' && envelope.shown === true
}

export type ActiveTabBrowser = {
  activeTab(): Promise<number | null>
  side(): Promise<PanelSide>
  connect(tabId: number): PagePopupPort
  lastError(): unknown
}

const chromeBrowser: ActiveTabBrowser = {
  async activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    return tab?.id ?? null
  },
  async side() {
    if (typeof chrome.sidePanel?.getLayout !== 'function') return 'right'
    return (await chrome.sidePanel.getLayout()).side === 'left' ? 'left' : 'right'
  },
  connect: tabId => chrome.tabs.connect(tabId, { name: pagePopupPort, frameId: 0 }),
  lastError: () => chrome.runtime.lastError
}

type Request = { shown: boolean; end(): void }

export function popupOnActiveTab(browser: ActiveTabBrowser = chromeBrowser): PagePopup {
  const live = new Set<Request>()
  let latest: Request | null = null
  const endAll = () => {
    for (const each of [...live]) each.end()
  }
  return (word, heard) => {
    let state: 'asking' | 'connected' | 'shown' | 'done' = 'asking'
    let port: PagePopupPort | null = null
    const finish = () => {
      state = 'done'
      live.delete(request)
    }
    const request: Request = {
      get shown() {
        return state === 'shown'
      },
      end() {
        if (state === 'done') return
        finish()
        port?.disconnect()
      }
    }
    for (const each of [...live]) if (!each.shown) each.end()
    live.add(request)
    latest = request
    const unavailable = () => {
      if (state === 'done') return
      finish()
      if (latest === request) endAll()
      heard.unavailable()
    }
    const connect = (tabId: number, side: PanelSide) => {
      if (state !== 'asking') return
      const connected = browser.connect(tabId)
      port = connected
      state = 'connected'
      connected.onMessage.addListener(message => {
        if (state !== 'connected' || !isShown(message)) return
        state = 'shown'
        heard.shown()
      })
      connected.onDisconnect.addListener(() => {
        browser.lastError()
        if (state === 'connected') unavailable()
        else if (state === 'shown') {
          finish()
          heard.closed()
        }
      })
      connected.postMessage({ target: 'word-popup', show: { ...word, side } })
    }
    Promise.all([browser.activeTab(), browser.side().catch(() => 'right' as const)])
      .then(([tabId, side]) => (tabId === null ? unavailable() : connect(tabId, side)))
      .catch(unavailable)
    return () => {
      if (latest === request) endAll()
    }
  }
}
