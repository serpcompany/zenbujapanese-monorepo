import { rubySegments } from '@zenbu/dictionary-core/detail/ruby'
import { fixtureWordRows } from '@zenbu/dictionary-core/fixtures'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { lookUpLabels } from '../look-up/labels'
import type { DataState } from '../shared/data-state'
import { labels as sharedLabels } from '../shared/labels'
import type { DictionaryAnswer, DictionaryRequest } from '../shared/messages'
import { fakeChrome } from '../test/fake-chrome'
import { translateLabels } from '../translate/labels'
import { labels } from './labels'
import { SidePanel } from './panel'
import type { PanelHost } from './panel-host'
import type { PanelRoute, PanelTab } from './route'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('./header-controls', async () => {
  const { createElement } = await import('react')
  return { HeaderControls: () => createElement('div', { 'data-header-controls': '' }) }
})

let root: Root | undefined
let browser: ReturnType<typeof fakeChrome>

beforeEach(() => {
  browser = fakeChrome()
  vi.stubGlobal('chrome', browser.chrome)
})

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

function fakeHost(lastTab: PanelTab = 'lookUp', pending: PanelRoute | null = null) {
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
    }
  }
  const move = (route: PanelRoute) =>
    act(async () => {
      for (const watcher of watchers) watcher(route)
    })
  return { ...host, kept, move }
}

async function draw(host: PanelHost, data: DataState | null = null, again = vi.fn()) {
  await act(async () => {
    root ??= createRoot(document.body.appendChild(document.createElement('div')))
    root.render(<SidePanel host={host} data={data} again={again} />)
  })
  return again
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
const translateBox = () => shown('textarea')[0] as HTMLTextAreaElement | undefined
const lookUpBox = () => shown('input[aria-label="Look Up"]')[0] as HTMLInputElement | undefined
const shownButton = (name: string) =>
  shown('button').find(each => each.textContent === name) as HTMLElement
const testPageText = () => shown('[data-test-page]').map(page => page.textContent)
const click = (element: HTMLElement) => act(async () => element.click())
const press = (element: HTMLElement, key: string) =>
  act(async () => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })

describe('SidePanel', () => {
  it("is named Zenbu Japanese for a screen reader, and its header draws only the site switch and menu, not the name and mark Chrome's own title shows", async () => {
    await draw(fakeHost())
    const header = document.querySelector('header') as HTMLElement
    const heading = document.querySelector('h1')
    expect(heading?.textContent).toBe(sharedLabels.name)
    expect(heading?.className).toBe('sr-only')
    expect(heading?.parentElement).toBe(header)
    expect(header.querySelector('img')).toBeNull()
    expect(header.querySelector('[data-header-controls]')).not.toBeNull()
    const drawn = [...header.childNodes].filter(node => node !== heading)
    expect(drawn.map(node => node.textContent).join('')).toBe('')
  })

  it("shows the app's four tabs, in its order, with its labels and icons", async () => {
    await draw(fakeHost())
    expect(tabs().map(each => each.textContent)).toEqual([
      'Look Up',
      'Translate',
      'Player',
      'Account'
    ])
    expect(tabs().map(each => each.querySelector('svg')?.classList[1])).toEqual([
      'lucide-search',
      'lucide-languages',
      'lucide-square-play',
      'lucide-circle-user-round'
    ])
    expect(document.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe(
      labels.tabBar
    )
  })

  it('opens each tab on its own screen', async () => {
    await draw(fakeHost())
    expect(selectedTab()?.textContent).toBe('Look Up')
    expect(lookUpBox()?.placeholder).toBe(lookUpLabels.placeholder)
    expect(emptyTitles()).toEqual([])
    await click(tab('Translate'))
    expect(translateBox()?.placeholder).toBe(translateLabels.placeholder)
    expect(shown('button').map(each => each.textContent)).toContain(translateLabels.translate)
    expect(lookUpBox()).toBeUndefined()
    await click(tab('Player'))
    expect(emptyTitles()).toEqual([labels.empty.video.title, labels.empty.recent.title])
    expect(shown('[data-recent] h2').map(each => each.textContent)).toEqual([labels.recent])
    await click(tab('Account'))
    expect(emptyTitles()).toEqual([labels.empty.account.title, labels.empty.words.title])
    expect(shown('[data-account="signed-out"], [data-profile="words"]')).toHaveLength(2)
  })

  it('opens Image Search from the Image row on Translate, and Back returns to the box', async () => {
    await draw(fakeHost('translate'))
    await click(shownButton(translateLabels.image))
    expect(backButton()?.getAttribute('aria-label')).toBe('Back to Translate')
    expect(emptyTitles()).toEqual([labels.empty.imageSearch.title])
    await click(backButton() as HTMLElement)
    expect(translateBox()).toBeDefined()
  })

  it('opens the word card from a Look Up result, over Look Up', async () => {
    const [iru] = fixtureWordRows
    const answers: Record<string, DictionaryAnswer> = {
      state: { type: 'state', data: { state: 'ready', release: '1', bytes: 1, checkedAt: null } },
      search: {
        type: 'search',
        screen: {
          state: 'results',
          query: 'iru',
          sections: ['results'],
          examples: null,
          readingRefinement: null,
          kanji: null,
          rows: [
            {
              ...iru.entry,
              ruby: rubySegments(iru.entry.headword, iru.entry.reading),
              summary: 'to be needed',
              chips: [],
              retrievalOrder: 0
            }
          ],
          resultCount: 1
        }
      },
      word: { type: 'word', rows: iru }
    }
    browser.chrome.runtime.onMessage.addListener((message, _sender, respond) => {
      const { request } = message as { request: DictionaryRequest }
      respond(answers[request.type])
      return true
    })
    await draw(fakeHost())
    act(() => {
      const box = lookUpBox() as HTMLInputElement
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(box, 'iru')
      box.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(shownButton(lookUpLabels.search))
    const row = shown(`[data-result-row="${iru.entry.entSeq}"]`)[0]?.closest('button')
    await click(row as HTMLElement)
    expect(backButton()?.getAttribute('aria-label')).toBe('Back to Look Up')
    expect(shown('h1[aria-label]').map(title => title.getAttribute('aria-label'))).toEqual(['要る'])
    expect(browser.sent).toContainEqual({
      target: 'service-worker',
      request: { type: 'search', query: 'iru' }
    })
    await click(backButton() as HTMLElement)
    expect(lookUpBox()?.value).toBe('iru')
  })

  it('moves along the tab bar with the arrow keys, wrapping at the ends', async () => {
    await draw(fakeHost())
    act(() => tab('Look Up').focus())
    await press(tab('Look Up'), 'ArrowRight')
    expect(selectedTab()?.textContent).toBe('Translate')
    expect(document.activeElement).toBe(tab('Translate'))
    await press(tab('Translate'), 'ArrowLeft')
    await press(tab('Look Up'), 'ArrowLeft')
    expect(selectedTab()?.textContent).toBe('Account')
  })

  it('opens a page over a tab, keeps the tab bar in view, and Back names the tab and returns to it', async () => {
    const host = fakeHost()
    await draw(host)
    await host.move({ page: { page: 'test', text: '猫' } })
    expect(testPageText()).toEqual(['猫'])
    expect(isShown(document.querySelector('[role="tablist"]'))).toBe(true)
    expect(lookUpBox()).toBeUndefined()
    expect(backButton()?.getAttribute('aria-label')).toBe('Back to Look Up')

    await click(shownButton(labels.testPage.openAnother))
    expect(testPageText()).toEqual(['猫 +'])
    await click(backButton() as HTMLElement)
    expect(testPageText()).toEqual(['猫'])
    await click(backButton() as HTMLElement)
    expect(testPageText()).toEqual([])
    expect(backButton()).toBeUndefined()
    expect(lookUpBox()).toBeDefined()
  })

  it("keeps each tab's pages when another tab is chosen", async () => {
    const host = fakeHost()
    await draw(host)
    await host.move({ page: { page: 'test', text: '猫' } })
    await host.move({ tab: 'account', page: { page: 'test', text: '犬' } })
    expect(selectedTab()?.textContent).toBe('Account')
    expect(backButton()?.getAttribute('aria-label')).toBe('Back to Account')
    expect(testPageText()).toEqual(['犬'])
    await click(tab('Look Up'))
    expect(testPageText()).toEqual(['猫'])
    await click(tab('Account'))
    await click(backButton() as HTMLElement)
    expect(emptyTitles()).toEqual([labels.empty.account.title, labels.empty.words.title])
  })

  it('comes back on the last tab after it closes and opens again', async () => {
    const host = fakeHost()
    await draw(host)
    await click(tab('Player'))
    act(() => root?.unmount())
    root = undefined
    document.body.replaceChildren()
    await draw(host)
    expect(selectedTab()?.textContent).toBe('Player')
  })

  it('starts on a route handed over before it loaded, and takes the route so it is used once', async () => {
    const host = fakeHost('translate', { tab: 'player', page: { page: 'test', text: '食べた' } })
    await draw(host)
    expect(selectedTab()?.textContent).toBe('Player')
    expect(testPageText()).toEqual(['食べた'])
    expect(host.kept.pending).toBeNull()
  })

  it('offers sign-up on the website in a new tab from Player and Account, and no link from Look Up', async () => {
    await draw(fakeHost())
    expect(shownPanel()?.querySelectorAll('a')).toHaveLength(0)
    for (const name of ['Player', 'Account']) {
      await click(tab(name))
      const links = shownPanel()?.querySelectorAll('a') ?? []
      expect([...links].map(link => [link.textContent, link.href, link.target])).toEqual([
        [labels.signUp, 'https://zenbujapanese.com/register/', '_blank']
      ])
    }
  })

  it('moves focus to the Back row of a page it opens, and to what Back reveals', async () => {
    const host = fakeHost()
    await draw(host)
    await host.move({ page: { page: 'test', text: '猫' } })
    expect(document.activeElement).toBe(backButton())
    await click(shownButton(labels.testPage.openAnother))
    const second = backButton()
    expect(document.activeElement).toBe(second)
    await click(second as HTMLElement)
    expect(testPageText()).toEqual(['猫'])
    expect(document.activeElement).toBe(backButton())
    await click(backButton() as HTMLElement)
    expect(document.activeElement).toBe(shownPanel())
  })

  it('shows the dictionary progress on every tab but Translate while the dictionary is not ready', async () => {
    await draw(fakeHost(), { state: 'downloading', done: 10, total: 100 })
    expect(tabs()).toHaveLength(4)
    expect(shown('[data-dictionary-progress]')).toHaveLength(1)
    expect(emptyTitles()).toEqual([])
    expect(shown('button').filter(each => each.textContent === labels.tryAgain)).toHaveLength(0)
    await click(tab('Translate'))
    expect(shown('[data-dictionary-progress]')).toHaveLength(0)
    expect(translateBox()).toBeDefined()
  })

  it('has a page opened from Translate wait for the dictionary, under its Back row, and keeps the box', async () => {
    const host = fakeHost('translate')
    await draw(host, { state: 'checking' })
    act(() => {
      const box = translateBox() as HTMLTextAreaElement
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(box, '猫')
      box.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await host.move({ tab: 'translate', page: { page: 'test', text: '犬' } })
    expect(shown('[data-dictionary-progress]')).toHaveLength(1)
    expect(backButton()?.getAttribute('aria-label')).toBe(labels.backTo('Translate'))
    expect(shownPanel()?.textContent).not.toContain('犬')
    await draw(host, { state: 'ready', release: '2026.10.1', bytes: 1, checkedAt: null })
    expect(shown('[data-dictionary-progress]')).toHaveLength(0)
    expect(shownPanel()?.textContent).toContain('犬')
    await click(backButton() as HTMLElement)
    expect(translateBox()?.value).toBe('猫')
  })

  it('offers Try again when the dictionary failed, and shows the tab once it is ready', async () => {
    const host = fakeHost()
    const again = await draw(host, { state: 'failed', reason: 'offline' })
    const tryAgain = () => shown('button').find(each => each.textContent === labels.tryAgain)
    await click(tryAgain() as HTMLElement)
    expect(again).toHaveBeenCalledOnce()
    await draw(host, { state: 'checking' }, again)
    expect(tryAgain()).toBeUndefined()
    await draw(host, { state: 'ready', release: '2026.10.1', bytes: 1, checkedAt: null }, again)
    expect(shown('[data-dictionary-progress]')).toHaveLength(0)
    expect(lookUpBox()).toBeDefined()
  })
})
