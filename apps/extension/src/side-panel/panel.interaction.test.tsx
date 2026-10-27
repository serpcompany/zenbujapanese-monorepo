import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataState } from '../shared/data-state'
import { labels } from './labels'
import { SidePanel } from './panel'
import type { PanelHost } from './panel-host'
import { type PanelRoute, type PanelTab, panelTabs } from './route'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

function fakeHost(lastTab: PanelTab = 'video', pending: PanelRoute | null = null) {
  const watchers: Array<(route: PanelRoute) => void> = []
  const kept = { lastTab, pending }
  const host: PanelHost = {
    windowId: async () => 7,
    readLastTab: async () => kept.lastTab,
    saveLastTab: tab => {
      kept.lastTab = tab
    },
    readRoute: async () => kept.pending,
    clearRoute: () => {
      kept.pending = null
    },
    watchRoutes: (_windowId, listener) => {
      watchers.push(listener)
      return () => watchers.splice(watchers.indexOf(listener), 1)
    },
    openSettings: vi.fn()
  }
  const move = (route: PanelRoute) =>
    act(async () => {
      for (const watcher of watchers) watcher(route)
    })
  return { ...host, kept, move }
}

async function draw(host: PanelHost, data: DataState | null = null) {
  await act(async () => {
    root = createRoot(document.body.appendChild(document.createElement('div')))
    root.render(<SidePanel host={host} data={data} />)
  })
}

const tabs = () => [...document.querySelectorAll<HTMLElement>('[role="tab"]')]
const tab = (name: string) => tabs().find(each => each.textContent === name) as HTMLElement
const selectedTab = () => tabs().find(each => each.getAttribute('aria-selected') === 'true')
const shownPanel = () =>
  [...document.querySelectorAll<HTMLElement>('[role="tabpanel"]')].find(panel => !panel.hidden)
const isShown = (element: Element | null | undefined): boolean =>
  !!element && !element.closest('[hidden]')
const shown = (selector: string) =>
  [...document.querySelectorAll(selector)].filter(element => isShown(element))
const backButton = () => shown('button[aria-label^="Back to"]')[0] as HTMLButtonElement | undefined
const emptyTitles = () => shown('[data-slot="empty-title"]').map(title => title.textContent)
const testPageText = () => shown('[data-test-page]').map(page => page.textContent)
const click = (element: HTMLElement) => act(async () => element.click())
const press = (element: HTMLElement, key: string) =>
  act(async () => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })

describe('SidePanel', () => {
  it('shows five tabs, in order, each starting on its empty state', async () => {
    await draw(fakeHost())
    expect(tabs().map(each => each.textContent)).toEqual([
      'Video',
      'Translate',
      'Images',
      'Words',
      'Recent'
    ])
    expect(document.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe(
      labels.tabBar
    )
    for (const id of panelTabs) {
      await click(tab(labels.tabs[id]))
      expect(selectedTab()?.textContent).toBe(labels.tabs[id])
      expect(emptyTitles()).toEqual([labels.empty[id].title])
    }
  })

  it('moves along the tab bar with the arrow keys, wrapping at the ends', async () => {
    await draw(fakeHost())
    act(() => tab('Video').focus())
    await press(tab('Video'), 'ArrowRight')
    expect(selectedTab()?.textContent).toBe('Translate')
    expect(document.activeElement).toBe(tab('Translate'))
    await press(tab('Translate'), 'ArrowLeft')
    await press(tab('Video'), 'ArrowLeft')
    expect(selectedTab()?.textContent).toBe('Recent')
  })

  it('opens a page over a tab, keeps the tab bar in view, and Back names the tab and returns to it', async () => {
    const host = fakeHost()
    await draw(host)
    await host.move({ page: { page: 'test', text: '猫' } })
    expect(testPageText()).toEqual(['猫'])
    expect(isShown(document.querySelector('[role="tablist"]'))).toBe(true)
    expect(emptyTitles()).toEqual([])
    expect(backButton()?.getAttribute('aria-label')).toBe('Back to Video')

    await click(
      shown('button').find(each => each.textContent === labels.testPage.openAnother) as HTMLElement
    )
    expect(testPageText()).toEqual(['猫 +'])
    await click(backButton() as HTMLElement)
    expect(testPageText()).toEqual(['猫'])
    await click(backButton() as HTMLElement)
    expect(testPageText()).toEqual([])
    expect(backButton()).toBeUndefined()
    expect(emptyTitles()).toEqual([labels.empty.video.title])
  })

  it("keeps each tab's pages when another tab is chosen", async () => {
    const host = fakeHost()
    await draw(host)
    await host.move({ page: { page: 'test', text: '猫' } })
    await host.move({ tab: 'words', page: { page: 'test', text: '犬' } })
    expect(selectedTab()?.textContent).toBe('Words')
    expect(backButton()?.getAttribute('aria-label')).toBe('Back to Words')
    expect(testPageText()).toEqual(['犬'])
    await click(tab('Video'))
    expect(testPageText()).toEqual(['猫'])
    await click(tab('Words'))
    await click(backButton() as HTMLElement)
    expect(emptyTitles()).toEqual([labels.empty.words.title])
  })

  it('comes back on the last tab after it closes and opens again', async () => {
    const host = fakeHost()
    await draw(host)
    await click(tab('Recent'))
    act(() => root?.unmount())
    document.body.replaceChildren()
    await draw(host)
    expect(selectedTab()?.textContent).toBe('Recent')
  })

  it('starts on a route handed over before it loaded, and takes the route so it is used once', async () => {
    const host = fakeHost('translate', { tab: 'images', page: { page: 'test', text: '食べた' } })
    await draw(host)
    expect(selectedTab()?.textContent).toBe('Images')
    expect(testPageText()).toEqual(['食べた'])
    expect(host.kept.pending).toBeNull()
  })

  it('offers sign-up on the website in a new tab from Words and Recent, and nothing from Images', async () => {
    await draw(fakeHost())
    for (const name of ['Words', 'Recent']) {
      await click(tab(name))
      const links = shownPanel()?.querySelectorAll('a') ?? []
      expect([...links].map(link => [link.textContent, link.href, link.target])).toEqual([
        [labels.signUp, 'https://zenbujapanese.com/register/', '_blank']
      ])
    }
    await click(tab('Images'))
    expect(shownPanel()?.querySelectorAll('a, button')).toHaveLength(0)
  })

  it('opens the settings from the gear', async () => {
    const host = fakeHost()
    await draw(host)
    await click(document.querySelector(`button[aria-label="${labels.settings}"]`) as HTMLElement)
    expect(host.openSettings).toHaveBeenCalledOnce()
  })

  it('shows the dictionary progress, and no tabs, while the dictionary is not ready', async () => {
    await draw(fakeHost(), { state: 'downloading', done: 10, total: 100 })
    expect(document.querySelector('[data-dictionary-progress]')).not.toBeNull()
    expect(tabs()).toHaveLength(0)
  })
})
