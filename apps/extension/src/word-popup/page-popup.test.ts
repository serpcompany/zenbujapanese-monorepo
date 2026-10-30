import { describe, expect, it, vi } from 'vitest'
import { type FakePort, fakePort } from '../test/fake-port'
import {
  type ActiveTabBrowser,
  type PagePopupHeard,
  popupOnActiveTab,
  shownRequest
} from './page-popup'

const word = { text: '要求', ids: ['youkyuu'], fromBottom: 240 }
const shown = { target: 'word-popup', shown: true }

function onATab({ tab = 7 as number | null, side = 'left' as 'left' | 'right' } = {}) {
  const ports: FakePort[] = []
  const lastError = vi.fn()
  const active = { tab }
  const browser: ActiveTabBrowser = {
    activeTab: async () => active.tab,
    side: async () => side,
    connect: vi.fn((_tabId: number) => {
      const port = fakePort()
      ports.push(port)
      return port
    }),
    lastError
  }
  return { ports, browser, lastError, active, pagePopup: popupOnActiveTab(browser) }
}

function listener(): PagePopupHeard & { said: string[] } {
  const said: string[] = []
  return {
    said,
    shown: () => void said.push('shown'),
    closed: () => void said.push('closed'),
    unavailable: () => void said.push('unavailable')
  }
}

const settled = () => new Promise(done => setTimeout(done, 0))

describe('a word’s card on the page, asked for from the side panel', () => {
  it('reads only a whole request to show a card', () => {
    const show = { ...word, side: 'right' }
    expect(shownRequest({ target: 'word-popup', show })).toEqual(show)
    expect(shownRequest({ target: 'word-popup', show: { ...show, side: 'top' } })).toBeNull()
    expect(shownRequest({ target: 'word-popup', show: { ...show, ids: [1] } })).toBeNull()
    expect(shownRequest({ target: 'word-popup', show: { ...show, fromBottom: NaN } })).toBeNull()
    expect(shownRequest({ target: 'video', show })).toBeNull()
    expect(shownRequest('show')).toBeNull()
  })

  it('asks the active tab’s page to show the card at the panel’s side, and hears when it’s shown and when it goes', async () => {
    const tab = onATab({ side: 'left' })
    const heard = listener()
    tab.pagePopup(word, heard)
    await settled()
    expect(tab.browser.connect).toHaveBeenCalledExactlyOnceWith(7)
    expect(tab.ports[0]?.posted).toEqual([
      { target: 'word-popup', show: { ...word, side: 'left' } }
    ])
    tab.ports[0]?.say(shown)
    tab.ports[0]?.say(shown)
    expect(heard.said).toEqual(['shown'])
    tab.ports[0]?.drop()
    expect(heard.said).toEqual(['shown', 'closed'])
    expect(tab.lastError).toHaveBeenCalled()
  })

  it('hears that the page can’t show one when nothing there answers, or there’s no tab', async () => {
    const tab = onATab()
    const heard = listener()
    tab.pagePopup(word, heard)
    await settled()
    tab.ports[0]?.drop()
    expect(heard.said).toEqual(['unavailable'])

    const none = onATab({ tab: null })
    const alone = listener()
    none.pagePopup(word, alone)
    await settled()
    expect(none.browser.connect).not.toHaveBeenCalled()
    expect(alone.said).toEqual(['unavailable'])
  })

  it('puts the card away when the panel closes it, and asks nothing once closed before the tab is known', async () => {
    const tab = onATab()
    const close = tab.pagePopup(word, listener())
    await settled()
    tab.ports[0]?.say(shown)
    close()
    expect(tab.ports[0]?.disconnected).toBe(true)

    const early = onATab()
    early.pagePopup(word, listener())()
    await settled()
    expect(early.browser.connect).not.toHaveBeenCalled()
  })

  it('leaves the page to swap a shown card for the next, and ends one not yet shown', async () => {
    const tab = onATab()
    const first = tab.pagePopup(word, listener())
    await settled()
    tab.ports[0]?.say(shown)
    tab.pagePopup({ ...word, text: '要る', ids: ['iru'] }, listener())
    const third = tab.pagePopup({ ...word, text: '要', ids: ['you'] }, listener())
    first()
    expect(tab.ports[0]?.disconnected).toBe(false)
    await settled()
    expect(tab.browser.connect).toHaveBeenCalledTimes(2)
    expect(tab.ports[1]?.posted).toEqual([
      { target: 'word-popup', show: { ...word, text: '要', ids: ['you'], side: 'left' } }
    ])
    third()
    expect(tab.ports.map(port => port.disconnected)).toEqual([true, true])
  })

  it('takes the last card off the page, telling it so, when the next can’t be shown there', async () => {
    const tab = onATab()
    const first = listener()
    tab.pagePopup(word, first)
    await settled()
    tab.ports[0]?.say(shown)
    const next = listener()
    tab.pagePopup({ ...word, text: '要る', ids: ['iru'] }, next)
    await settled()
    tab.ports[1]?.drop()
    expect(next.said).toEqual(['unavailable'])
    expect(tab.ports[0]?.disconnected).toBe(true)
    await settled()
    expect(first.said).toEqual(['shown', 'closed'])
  })

  it('takes a shown card off a tab the learner left when the next is asked for on another tab', async () => {
    const tab = onATab()
    const first = tab.pagePopup(word, listener())
    await settled()
    tab.ports[0]?.say(shown)
    tab.active.tab = 8
    tab.pagePopup({ ...word, text: '要る', ids: ['iru'] }, listener())
    first()
    await settled()
    expect(tab.browser.connect).toHaveBeenLastCalledWith(8)
    expect(tab.ports.map(port => port.disconnected)).toEqual([true, false])
  })

  it('tells a card it went when a card asked for on another tab takes it off the tab the learner left', async () => {
    const tab = onATab()
    const first = listener()
    tab.pagePopup(word, first)
    await settled()
    tab.ports[0]?.say(shown)
    tab.active.tab = 8
    const next = listener()
    const close = tab.pagePopup({ ...word, text: '要る', ids: ['iru'] }, next)
    await settled()
    expect(first.said).toEqual(['shown', 'closed'])
    tab.ports[1]?.say(shown)
    close()
    await settled()
    expect(next.said).toEqual(['shown'])
  })

  it('tells a card not yet shown it went when the next is asked for, and tells nothing to the one that closes itself', async () => {
    const tab = onATab()
    const first = listener()
    tab.pagePopup(word, first)
    const next = listener()
    tab.pagePopup({ ...word, text: '要る', ids: ['iru'] }, next)()
    await settled()
    expect(first.said).toEqual(['closed'])
    expect(next.said).toEqual([])
  })
})
