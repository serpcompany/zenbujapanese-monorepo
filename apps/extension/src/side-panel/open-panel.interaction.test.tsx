import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startSidePanel } from '../service-worker/side-panel'
import { SidePanel } from './panel'
import { chromePanelHost } from './panel-host'
import type { PanelRoute } from './route'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('./header-controls', () => ({ HeaderControls: () => null }))

type Listener = (message: unknown, sender: object, respond: (answer: unknown) => void) => boolean

const noEvent = { addListener: () => undefined, removeListener: () => undefined }

const noGesture = '`sidePanel.open()` may only be called in response to a user gesture.'

const onTestPage: PanelRoute = { page: { page: 'test', text: '猫' } }

let panel: Root | undefined

afterEach(() => {
  act(() => panel?.unmount())
  panel = undefined
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

function storageArea() {
  const items = new Map<string, unknown>()
  return {
    items,
    get: async (key: string) => (items.has(key) ? { [key]: items.get(key) } : {}),
    set: async (values: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(values)) items.set(key, value)
    },
    remove: async (key: string) => {
      items.delete(key)
    }
  }
}

function fakeBrowser(windowId = 7) {
  const listeners = new Set<Listener>()
  const local = storageArea()
  const session = storageArea()
  const state = { gesture: false, panelOpen: false }
  const deliver = (message: unknown, sender: object) =>
    new Promise((resolve, reject) => {
      const kept = [...listeners].filter(listener => listener(message, sender, resolve))
      if (kept.length === 0) reject(new Error('Receiving end does not exist.'))
    })
  vi.stubGlobal('chrome', {
    storage: { local, session },
    runtime: {
      onMessage: {
        addListener: (listener: Listener) => listeners.add(listener),
        removeListener: (listener: Listener) => listeners.delete(listener)
      },
      sendMessage: (message: unknown) => deliver(message, {})
    },
    tabs: { query: async () => [], onActivated: noEvent, onUpdated: noEvent },
    windows: {
      WINDOW_ID_CURRENT: -2,
      WINDOW_ID_NONE: -1,
      getCurrent: async () => ({ id: windowId }),
      getLastFocused: async () => ({ id: windowId })
    },
    sidePanel: {
      setPanelBehavior: vi.fn(async () => undefined),
      open: async () => {
        if (!state.gesture) throw new Error(noGesture)
        state.panelOpen = true
      }
    }
  })
  startSidePanel(vi.fn())
  const openPanel = (route: PanelRoute, tabWindowId?: number) =>
    deliver(
      { target: 'service-worker', openPanel: route },
      tabWindowId === undefined ? {} : { tab: { windowId: tabWindowId } }
    ).then(
      () => undefined,
      () => undefined
    )
  const click = (handler: () => Promise<void>) =>
    act(async () => {
      state.gesture = true
      const done = handler()
      state.gesture = false
      await done
    })
  return { state, local: local.items, session: session.items, openPanel, click }
}

async function drawPanel() {
  await act(async () => {
    panel = createRoot(document.body.appendChild(document.createElement('div')))
    panel.render(<SidePanel host={chromePanelHost} data={null} again={() => undefined} />)
  })
}

function closePanel() {
  act(() => panel?.unmount())
  document.body.replaceChildren()
}

const selectedTab = () => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent
const testPageText = () =>
  [...document.querySelectorAll('[data-test-page]')]
    .filter(page => !page.closest('[hidden]'))
    .map(page => page.textContent)

describe('the openPanel message, through the service worker, to the side panel', () => {
  it('has Chrome open the panel when the toolbar icon is clicked', () => {
    fakeBrowser()
    expect(chrome.sidePanel.setPanelBehavior).toHaveBeenCalledExactlyOnceWith({
      openPanelOnActionClick: true
    })
  })

  it('opens the closed panel on the test page from a click on a page, and the route is used once', async () => {
    const browser = fakeBrowser()
    await browser.click(() => browser.openPanel(onTestPage, 7))
    expect(browser.state.panelOpen).toBe(true)
    await drawPanel()
    expect(selectedTab()).toBe('Translate')
    expect(testPageText()).toEqual(['猫'])
    expect(browser.session.size).toBe(0)
    closePanel()
    await drawPanel()
    expect(testPageText()).toEqual([])
  })

  it('moves the open panel to the route, on its tab', async () => {
    const browser = fakeBrowser()
    await drawPanel()
    await browser.click(() => browser.openPanel({ tab: 'account', ...onTestPage }, 7))
    expect(selectedTab()).toBe('Account')
    expect(testPageText()).toEqual(['猫'])
    expect(browser.session.size).toBe(0)
  })

  it('opens the panel from an extension page that has no tab, in the focused window', async () => {
    const browser = fakeBrowser()
    await browser.click(() => browser.openPanel({ tab: 'translate' }))
    expect(browser.state.panelOpen).toBe(true)
    await drawPanel()
    expect(selectedTab()).toBe('Translate')
  })

  it("leaves a panel alone when the click was in another window's tab", async () => {
    const browser = fakeBrowser()
    await drawPanel()
    await browser.click(() => browser.openPanel({ tab: 'player' }, 8))
    expect(selectedTab()).toBe('Translate')
    expect(browser.session.get('sidePanel.route.8')).toEqual({ tab: 'player' })
  })

  it('leaves no route behind when it is not called from a click', async () => {
    const browser = fakeBrowser()
    await act(() => browser.openPanel(onTestPage, 7))
    expect(browser.state.panelOpen).toBe(false)
    expect(browser.session.size).toBe(0)
  })

  it('keeps the last tab in local storage, and opens on it next time', async () => {
    const browser = fakeBrowser()
    await drawPanel()
    await act(async () => (document.querySelectorAll('[role="tab"]')[2] as HTMLElement).click())
    expect(browser.local.get('sidePanel.lastTab')).toBe('account')
    closePanel()
    await drawPanel()
    expect(selectedTab()).toBe('Account')
  })

  it.each([
    ['video', 'Player', 'player'],
    ['recent', 'Player', 'player'],
    ['images', 'Translate', 'translate'],
    ['words', 'Account', 'account'],
    ['lookUp', 'Translate', 'translate'],
    ['settings', 'Translate', 'translate']
  ])('opens on the tab that took over a last tab kept as %s, and keeps that tab instead', async (kept, opens, saved) => {
    const browser = fakeBrowser()
    browser.local.set('sidePanel.lastTab', kept)
    await drawPanel()
    expect(selectedTab()).toBe(opens)
    expect(browser.local.get('sidePanel.lastTab')).toBe(saved)
  })
})
