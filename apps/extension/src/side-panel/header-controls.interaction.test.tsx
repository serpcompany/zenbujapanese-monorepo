import { afterEach, describe, expect, it, vi } from 'vitest'
import { settingsLabels } from '../settings/labels'
import { SettingsPage } from '../settings/settings-page'
import { askSettings, onSettingsChanged, readingAidKeys, writeSettings } from '../shared/settings'
import { dictionary, resetDictionary } from '../test/dictionary'
import {
  aidShownOn,
  contentScriptShown,
  type FakeExtension,
  startContentScript,
  startExtension
} from '../test/extension'
import { allSites } from '../test/fake-chrome'
import { pageAids, pageLookupOn, stopPageLookups } from '../test/page-lookup'
import {
  byText,
  click,
  find,
  isOn,
  openMenu,
  type Rendered,
  render,
  settle,
  switchFor
} from '../test/render'
import { sentence } from '../test/word-cards'
import { HeaderControls } from './header-controls'

vi.mock('../shared/dictionary', () => import('../test/dictionary'))
vi.mock('../shared/dictionary-progress', () => import('../test/dictionary'))

const host = 'www3.nhk.or.jp'
const article = { id: 7, url: `https://${host}/news/easy/k10014.html` }
const granted = [`https://${host}/*`]
const siteSwitchName = `[role="switch"][aria-label="Zenbu on ${host}"]`

let opened: Rendered[] = []
let contentScripts: (() => void)[] = []

function lookUpInTab(fake: FakeExtension, tabId = article.id) {
  const tab = fake.inTab(tabId)
  document.body.insertAdjacentHTML('beforeend', `<p id="read">${sentence}</p>`)
  const { underlines } = pageLookupOn(
    {
      ask: () => askSettings(tab),
      onChanged: listener => onSettingsChanged(listener, tab.onMessage)
    },
    host
  )
  return underlines
}

async function drawHeader(): Promise<HTMLElement> {
  const header = render(<HeaderControls />)
  opened.push(header)
  await settle()
  return header.container
}

async function openSettings(page: string): Promise<HTMLElement> {
  location.hash = page
  const settings = render(<SettingsPage />)
  opened.push(settings)
  await settle()
  return settings.container
}

async function loadContentScript(fake: FakeExtension, tabId = article.id, on = host) {
  const stop = startContentScript(fake, tabId, on)
  contentScripts.push(stop)
  await settle()
  return stop
}

const menuSwitch = (menu: HTMLElement, setting: string) =>
  find(menu, `[role="menuitemcheckbox"][data-setting="${setting}"]`)

const isChecked = (item: HTMLElement) => item.getAttribute('aria-checked') === 'true'

afterEach(() => {
  stopPageLookups()
  for (const stop of contentScripts) stop()
  for (const page of opened) page.unmount()
  contentScripts = []
  opened = []
  resetDictionary()
  location.hash = ''
  document.body.replaceChildren()
})

describe("the side panel's header", () => {
  it('turns each reading aid on and off from its menu, Settings shows the same, and the open page hears it without a reload', async () => {
    const fake = startExtension({ tabs: [article], granted })
    await loadContentScript(fake)
    const header = await drawHeader()
    const settings = await openSettings('#reading-aids')
    const menu = await openMenu(header)
    for (const aid of readingAidKeys) {
      const first = isChecked(menuSwitch(menu, aid))
      for (const shown of [!first, first]) {
        await click(menuSwitch(menu, aid))
        expect(fake.items[aid]).toBe(shown)
        expect(isChecked(menuSwitch(menu, aid))).toBe(shown)
        expect(
          menuSwitch(menu, aid).querySelector('[data-slot="switch"]')?.hasAttribute('data-checked')
        ).toBe(shown)
        expect(isOn(switchFor(settings, aid))).toBe(shown)
        expect(aidShownOn(aid)).toBe(shown)
      }
    }
  })

  it('turns Zenbu Captions on and off from its menu, as Settings does', async () => {
    const fake = startExtension({ tabs: [article], granted })
    const header = await drawHeader()
    const settings = await openSettings('#reading-aids')
    const menu = await openMenu(header)
    await click(menuSwitch(menu, 'videos.zenbuCaptions'))
    expect(fake.items['videos.zenbuCaptions']).toBe(false)
    expect(isOn(switchFor(settings, 'videos.zenbuCaptions'))).toBe(false)
  })

  it('offers Reset Caption Position once either caption box has moved, and it puts both back', async () => {
    const fake = startExtension({ tabs: [article], granted })
    const reset = (menu: HTMLElement) =>
      byText(menu, '[role="menuitem"]', settingsLabels.menu.resetCaptionPosition)
    const unmoved = await openMenu(await drawHeader())
    expect(reset(unmoved).hasAttribute('data-disabled')).toBe(true)
    for (const page of opened) page.unmount()
    opened = []
    document.body.replaceChildren()

    await writeSettings({
      'videos.captionPlace': { x: 0.2, y: 0.1 },
      'videos.translationPlace': { x: 0.5, y: 1 }
    })
    const menu = await openMenu(await drawHeader())
    expect(reset(menu).hasAttribute('data-disabled')).toBe(false)
    await click(reset(menu))
    expect(fake.items['videos.captionPlace']).toBeNull()
    expect(fake.items['videos.translationPlace']).toBeNull()
  })

  it("turns Page Text off and on from its menu, under Pages between Reading Aids and Videos, as Settings does, apart from the site's switch, and the open page hears it without a reload", async () => {
    const fake = startExtension({ tabs: [article], granted })
    const underlines = lookUpInTab(fake)
    await vi.waitFor(() => expect(pageAids()).toBeGreaterThan(0))
    const header = await drawHeader()
    const settings = await openSettings('#reading-aids')
    const menu = await openMenu(header)
    const titles = [...menu.querySelectorAll('[data-slot="dropdown-menu-label"]')].map(
      label => label.textContent
    )
    expect(titles.slice(-3)).toEqual(['Reading Aids', 'Pages', 'Videos'])
    const pageGroup = menuSwitch(menu, 'pages.pageText').closest(
      '[data-slot="dropdown-menu-group"]'
    )
    expect(pageGroup?.querySelector('[data-slot="dropdown-menu-label"]')?.textContent).toBe('Pages')
    expect(isChecked(menuSwitch(menu, 'pages.pageText'))).toBe(true)

    await click(menuSwitch(menu, 'pages.pageText'))
    expect(fake.items['pages.pageText']).toBe(false)
    expect(isChecked(menuSwitch(menu, 'pages.pageText'))).toBe(false)
    expect(isOn(switchFor(settings, 'pages.pageText'))).toBe(false)
    expect(isOn(find(header, siteSwitchName))).toBe(true)
    expect(isChecked(menuSwitch(menu, 'videos.zenbuCaptions'))).toBe(true)
    await vi.waitFor(() => expect(pageAids()).toBe(0))
    expect(underlines.stop).toHaveBeenCalled()

    underlines.draw.mockClear()
    await click(switchFor(settings, 'pages.pageText'))
    expect(fake.items['pages.pageText']).toBe(true)
    expect(isChecked(menuSwitch(menu, 'pages.pageText'))).toBe(true)
    await vi.waitFor(() => expect(pageAids()).toBeGreaterThan(0))
    expect(underlines.draw).toHaveBeenCalled()
  })

  it('waits for Furigana before Hide Furigana on Known Words can change', async () => {
    const fake = startExtension({ tabs: [article], granted })
    const menu = await openMenu(await drawHeader())
    await click(menuSwitch(menu, 'readingAids.furigana'))
    const hide = menuSwitch(menu, 'readingAids.furiganaHiddenOnKnownWords')
    expect(hide.hasAttribute('data-disabled')).toBe(true)
    await click(hide)
    expect(fake.items['readingAids.furiganaHiddenOnKnownWords']).toBeUndefined()
  })

  it("turns Zenbu off for the tab's site, keeps it off after a reload, lists it under Sites, and Turn On brings it back", async () => {
    const fake = startExtension({ tabs: [article], granted })
    const stopFirstLoad = await loadContentScript(fake)
    expect(contentScriptShown()).not.toBeNull()

    const header = await drawHeader()
    expect(find(await openMenu(header), '[data-site-status]').textContent).toBe(
      'Zenbu is on for this site'
    )
    await click(find(header, siteSwitchName))
    expect(fake.items['sites.off']).toEqual([host])
    expect(isOn(find(header, siteSwitchName))).toBe(false)
    expect(find(document, '[data-site-status]').textContent).toBe('Zenbu is off for this site')
    expect(contentScriptShown()).toBeNull()

    stopFirstLoad()
    await loadContentScript(fake)
    expect(contentScriptShown()).toBeNull()

    const settings = await openSettings('#sites')
    expect(find(settings, '[data-site-off]').getAttribute('data-site-off')).toBe(host)
    await click(byText(settings, 'button', 'Turn On'))
    expect(fake.items['sites.off']).toEqual([])
    expect(settings.querySelector('[data-site-off]')).toBeNull()
    expect(contentScriptShown()).not.toBeNull()
    expect(isOn(find(header, siteSwitchName))).toBe(true)
  })

  it('follows the active tab to another site, to a page Chrome hides from Zenbu, and back', async () => {
    const other = { id: 8, url: 'https://www.asahi.com/articles/' }
    const extensionsPage = { id: 9, url: 'chrome://extensions/' }
    const fake = startExtension({
      tabs: [article, other, extensionsPage],
      granted: [...granted, 'https://www.asahi.com/*']
    })
    await loadContentScript(fake)
    startContentScript(fake, other.id, 'www.asahi.com')
    const header = await drawHeader()
    expect(header.querySelector(siteSwitchName)).not.toBeNull()

    fake.switchTo(other.id)
    await settle()
    expect(
      header.querySelector('[role="switch"][aria-label="Zenbu on www.asahi.com"]')
    ).not.toBeNull()
    expect(header.querySelector(siteSwitchName)).toBeNull()

    fake.switchTo(extensionsPage.id)
    await settle()
    expect(header.querySelector('[role="switch"]')).toBeNull()
    expect(find(await openMenu(header), '[data-site]').getAttribute('data-site')).toBe('unseen')

    fake.load({ id: extensionsPage.id, url: article.url })
    await settle()
    expect(header.querySelector(siteSwitchName)).not.toBeNull()
  })

  it("says Zenbu can't see a page whose address Chrome withholds, and how to let Zenbu in, with no switch and no Allow", async () => {
    startExtension({ tabs: [article] })
    const header = await drawHeader()
    expect(header.querySelector('[role="switch"]')).toBeNull()
    const menu = await openMenu(header)
    const site = find(menu, '[data-site]')
    expect(site.getAttribute('data-site')).toBe('unseen')
    expect(site.textContent).toContain("Zenbu can't see this page")
    expect(site.textContent).toContain('change its site access')
    expect(site.textContent).not.toContain(host)
    expect(menu.textContent).not.toContain('Allow')
  })

  it("shows the switch once Chrome's site access lets Zenbu in, without a reload", async () => {
    const fake = startExtension({ tabs: [article] })
    const header = await drawHeader()
    expect(header.querySelector('[role="switch"]')).toBeNull()
    fake.grant(granted)
    await settle()
    expect(find(header, siteSwitchName)).toBeTruthy()
  })

  it("gives the switch up when Chrome's site access is taken back, for Allow on a tab the toolbar icon shows, and for can't see on any other", async () => {
    const fake = startExtension({
      tabs: [article, { id: 8, url: `https://${host}/news/easy/k10015.html` }],
      granted
    })
    fake.clickIcon(article.id)
    const header = await drawHeader()
    expect(find(header, siteSwitchName)).toBeTruthy()
    fake.revoke(granted)
    await settle()
    expect(header.querySelector('[role="switch"]')).toBeNull()
    const menu = await openMenu(header)
    expect(find(menu, '[data-site]').getAttribute('data-site')).toBe('no-access')
    expect(byText(menu, '[role="menuitem"]', 'Allow on This Site')).toBeTruthy()
    fake.switchTo(8)
    await settle()
    expect(find(menu, '[data-site]').getAttribute('data-site')).toBe('unseen')
  })

  it("says Zenbu can't run on the Chrome Web Store, where Chrome shows the address, with no switch", async () => {
    startExtension({
      tabs: [{ id: 2, url: 'https://chromewebstore.google.com/detail/zenbu/abc' }],
      granted: allSites
    })
    const header = await drawHeader()
    expect(header.querySelector('[role="switch"]')).toBeNull()
    const site = find(await openMenu(header), '[data-site]')
    expect(site.getAttribute('data-site')).toBe('cant-run')
    expect(site.textContent).toContain("Zenbu can't run here")
  })

  it("names the site and asks Chrome for it where the toolbar icon shows the address but Chrome's site access keeps Zenbu off", async () => {
    const fake = startExtension({ tabs: [article] })
    fake.clickIcon(article.id)
    const header = await drawHeader()
    expect(header.querySelector('[role="switch"]')).toBeNull()
    const menu = await openMenu(header)
    const site = find(menu, '[data-site="no-access"]')
    expect(site.textContent).toContain(host)
    expect(site.textContent).toContain("Chrome's site access keeps Zenbu off this site")
    await click(byText(menu, '[role="menuitem"]', 'Allow on This Site'))
    expect(fake.requested).toEqual([granted])
    expect(find(header, siteSwitchName)).toBeTruthy()
  })

  it('opens Settings from its menu', async () => {
    const fake = startExtension({ tabs: [article], granted })
    const menu = await openMenu(await drawHeader())
    await click(byText(menu, '[role="menuitem"]', 'Settings'))
    expect(fake.opened.optionsPage).toBe(1)
  })

  it('offers Show Welcome Tab only while the dictionary downloads', async () => {
    startExtension({ tabs: [article], granted })
    resetDictionary({ state: 'ready', release: '2026-10-01', bytes: 1, checkedAt: null })
    const ready = await openMenu(await drawHeader())
    expect(ready.textContent).not.toContain('Show Welcome Tab')
    for (const page of opened) page.unmount()
    opened = []
    document.body.replaceChildren()

    resetDictionary({ state: 'downloading', done: 10, total: 100 })
    const downloading = await openMenu(await drawHeader())
    await click(byText(downloading, '[role="menuitem"]', 'Show Welcome Tab'))
    expect(dictionary.welcomeTabs).toBe(1)
  })
})
