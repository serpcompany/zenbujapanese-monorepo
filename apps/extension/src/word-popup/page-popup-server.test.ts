import { describe, expect, it, vi } from 'vitest'
import { type Settings, settingDefaults } from '../shared/settings'
import { type FakePort, fakePort } from '../test/fake-port'
import type { PagePopupPort } from './page-popup'
import { servePagePopups } from './page-popup-server'
import type { PopupHost, PopupTarget } from './popup-host'

const show = (fields: Record<string, unknown> = {}) => ({
  target: 'word-popup',
  show: { text: '要求', ids: ['youkyuu'], fromBottom: 240, side: 'right', ...fields }
})

function fakeHost() {
  let current: PopupTarget | null = null
  const host = {
    open: vi.fn((target: PopupTarget) => {
      const previous = current
      current = target
      previous?.closed?.()
    }),
    close: vi.fn(() => {
      const previous = current
      current = null
      previous?.closed?.()
    }),
    holds: () => false,
    shown: () => current
  }
  return host satisfies PopupHost
}

function aPage({ on = true, ask = async (): Promise<Settings> => settingDefaults } = {}) {
  const listeners = new Set<(port: PagePopupPort) => void>()
  const host = fakeHost()
  let changed: (settings: Settings) => void = () => {}
  const stop = servePagePopups({
    runtime: {
      onConnect: {
        addListener: listener => void listeners.add(listener),
        removeListener: listener => void listeners.delete(listener)
      }
    },
    view: { innerHeight: 800 } as Window,
    settings: {
      ask,
      onChanged: listener => {
        changed = listener
        return () => {}
      }
    },
    on: settings => on && settings['readingAids.furigana'],
    popup: () => host
  })
  const connect = (name?: string) => {
    const port = fakePort(name)
    for (const listener of listeners) listener(port)
    return port
  }
  return { host, connect, stop, listeners, change: (next: Settings) => changed(next) }
}

const settled = () => new Promise(done => setTimeout(done, 0))

const asked = async (port: FakePort, message: unknown = show()) => {
  port.say(message)
  await settled()
}

describe('the page’s side of a card the side panel asks for', () => {
  it('shows the word at the panel’s edge, level with the word, and says so', async () => {
    const page = aPage()
    const port = page.connect()
    await asked(port)
    expect(page.host.open).toHaveBeenCalledOnce()
    expect(page.host.shown()).toMatchObject({
      text: '要求',
      ids: ['youkyuu'],
      edge: { side: 'right', top: 560 }
    })
    expect(port.posted).toEqual([{ target: 'word-popup', shown: true }])
  })

  it('answers only its own port, and refuses a broken request or a page where Zenbu is off', async () => {
    const page = aPage()
    const other = page.connect('video-tab')
    await asked(other)
    expect(page.host.open).not.toHaveBeenCalled()

    const broken = page.connect()
    await asked(broken, show({ side: 'middle' }))
    expect(broken.disconnected).toBe(true)

    page.change({ ...settingDefaults, 'readingAids.furigana': false })
    const off = page.connect()
    await asked(off)
    expect(off.disconnected).toBe(true)
    expect(page.host.open).not.toHaveBeenCalled()

    const unread = aPage({ ask: () => Promise.reject(new Error('gone')) })
    const early = unread.connect()
    await asked(early)
    expect(early.disconnected).toBe(true)
  })

  it('closes the card when the panel lets go, and lets the panel go when the card closes', async () => {
    const page = aPage()
    const port = page.connect()
    await asked(port)
    port.drop()
    expect(page.host.close).toHaveBeenCalledOnce()

    const again = page.connect()
    await asked(again)
    page.host.close()
    expect(again.disconnected).toBe(true)
  })

  it('lets the earlier panel request go when a later one takes its place, without closing the card', async () => {
    const page = aPage()
    const first = page.connect()
    await asked(first)
    const second = page.connect()
    await asked(second, show({ text: '要る', ids: ['iru'] }))
    expect(first.disconnected).toBe(true)
    expect(second.disconnected).toBe(false)
    expect(page.host.close).not.toHaveBeenCalled()
    first.drop()
    expect(page.host.close).not.toHaveBeenCalled()
  })

  it('shows nothing for a panel that let go before the page was ready, and stops with the page script', async () => {
    let answer: (settings: Settings) => void = () => {}
    const page = aPage({ ask: () => new Promise(done => (answer = done)) })
    const gone = page.connect()
    gone.say(show())
    gone.drop()
    answer(settingDefaults)
    await settled()
    expect(page.host.open).not.toHaveBeenCalled()

    const port = page.connect()
    await asked(port)
    page.stop()
    expect(page.listeners.size).toBe(0)
    expect(page.host.close).toHaveBeenCalledOnce()
    expect(port.disconnected).toBe(true)
  })
})
