import { afterEach, describe, expect, it } from 'vitest'
import { type Settings, settingDefaults } from '../shared/settings'
import type { FakePort } from '../test/fake-port'
import { fakePopupHost, fakeRuntime } from '../test/page-frame'
import { servePagePopups } from './page-popup-server'
import { shownWordPopup } from './popup-events'

const show = (fields: Record<string, unknown> = {}) => ({
  target: 'word-popup',
  show: { text: '要求', ids: ['youkyuu'], fromBottom: 240, side: 'right', ...fields }
})

const stops: (() => void)[] = []

afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  shownWordPopup().current = null
})

function aPage({
  on = true,
  ask = async (): Promise<Settings> => settingDefaults,
  frame = fakeRuntime(),
  preferred = false
} = {}) {
  const host = fakePopupHost()
  const view = Object.assign(new EventTarget(), { innerHeight: 800, setTimeout })
  let changed: (settings: Settings) => void = () => {}
  const stop = servePagePopups({
    runtime: frame.runtime,
    view: view as unknown as Window,
    settings: {
      ask,
      onChanged: listener => {
        changed = listener
        return () => {}
      }
    },
    on: settings => on && settings['readingAids.furigana'],
    popup: () => host,
    preferred
  })
  stops.push(stop)
  return {
    host,
    view,
    connect: frame.connect,
    stop,
    listeners: frame.listeners,
    change: (next: Settings) => changed(next)
  }
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
    page.stop()

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

  it('answers once in a frame where both content scripts serve cards, through the YouTube script’s, whichever starts first', async () => {
    for (const youtubeFirst of [false, true]) {
      const frame = fakeRuntime()
      const start = (preferred: boolean) => aPage({ frame, preferred })
      const first = start(youtubeFirst)
      const second = start(!youtubeFirst)
      const [youtube, pageLookup] = youtubeFirst ? [first, second] : [second, first]
      const port = frame.connect()
      await asked(port)
      expect(youtube.host.open).toHaveBeenCalledOnce()
      expect(pageLookup.host.open).not.toHaveBeenCalled()
      expect(port.posted).toEqual([{ target: 'word-popup', shown: true }])
      expect(port.disconnected).toBe(false)

      youtube.stop()
      const later = frame.connect()
      await asked(later)
      expect(pageLookup.host.open).toHaveBeenCalledOnce()
      expect(later.posted).toEqual([{ target: 'word-popup', shown: true }])
      pageLookup.stop()
    }
  })

  it('keeps the panel’s request while another part’s card takes the card’s place, until the last card closes', async () => {
    const page = aPage()
    const captions = fakePopupHost()
    const port = page.connect()
    await asked(port)
    captions.open({ text: '要る', ids: ['iru'], edge: { side: 'right', top: 0 } })
    expect(page.host.shown()).toBeNull()
    expect(port.disconnected).toBe(false)
    captions.close()
    expect(port.disconnected).toBe(true)

    const again = page.connect()
    await asked(again)
    captions.open({ text: '要る', ids: ['iru'], edge: { side: 'right', top: 0 } })
    again.drop()
    expect(captions.shown()).not.toBeNull()
    expect(page.host.close).not.toHaveBeenCalled()
  })

  it('lets a replaced request go when the panel asks for another card', async () => {
    const page = aPage()
    const captions = fakePopupHost()
    const first = page.connect()
    await asked(first)
    captions.open({ text: '要る', ids: ['iru'], edge: { side: 'right', top: 0 } })
    const second = page.connect()
    await asked(second, show({ text: '要る', ids: ['iru'] }))
    expect(first.disconnected).toBe(true)
    expect(second.disconnected).toBe(false)
    expect(captions.shown()).toBeNull()
  })

  it('keeps the panel’s request across a press that closes its card and opens another, and lets go after a press that opens none', async () => {
    const page = aPage()
    const captions = fakePopupHost()
    const press = (type: string) => page.view.dispatchEvent(new Event(type))
    const port = page.connect()
    await asked(port)
    press('pointerdown')
    page.host.close()
    captions.open({ text: '要る', ids: ['iru'], edge: { side: 'right', top: 0 } })
    press('pointerup')
    await settled()
    expect(port.disconnected).toBe(false)
    captions.close()
    expect(port.disconnected).toBe(true)

    const again = page.connect()
    await asked(again)
    press('pointerdown')
    page.host.close()
    expect(again.disconnected).toBe(false)
    press('pointerup')
    await settled()
    expect(again.disconnected).toBe(true)
  })
})
