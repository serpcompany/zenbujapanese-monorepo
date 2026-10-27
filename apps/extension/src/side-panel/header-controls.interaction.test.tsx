import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from '../settings/settings-page'
import { readingAidKeys } from '../shared/settings'
import { dictionary, resetDictionary } from '../test/dictionary'
import {
  aidShownOn,
  contentScriptShown,
  type FakeExtension,
  startContentScript,
  startExtension
} from '../test/extension'
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
import { HeaderControls } from './header-controls'

vi.mock('../shared/dictionary', () => import('../test/dictionary'))
vi.mock('../shared/dictionary-progress', () => import('../test/dictionary'))

const host = 'www3.nhk.or.jp'
const article = { id: 7 }
const siteSwitchName = `[role="switch"][aria-label="Zenbu on ${host}"]`

let opened: Rendered[] = []
let contentScripts: (() => void)[] = []

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
    const fake = startExtension({ tabs: [article] })
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
    const fake = startExtension({ tabs: [article] })
    const header = await drawHeader()
    const settings = await openSettings('#reading-aids')
    const menu = await openMenu(header)
    await click(menuSwitch(menu, 'videos.zenbuCaptions'))
    expect(fake.items['videos.zenbuCaptions']).toBe(false)
    expect(isOn(switchFor(settings, 'videos.zenbuCaptions'))).toBe(false)
  })

  it('waits for Furigana before Hide Furigana on Known Words can change', async () => {
    const fake = startExtension({ tabs: [article] })
    const menu = await openMenu(await drawHeader())
    await click(menuSwitch(menu, 'readingAids.furigana'))
    const hide = menuSwitch(menu, 'readingAids.furiganaHiddenOnKnownWords')
    expect(hide.hasAttribute('data-disabled')).toBe(true)
    await click(hide)
    expect(fake.items['readingAids.furiganaHiddenOnKnownWords']).toBeUndefined()
  })

  it("turns Zenbu off for the tab's site, keeps it off after a reload, lists it under Sites, and Turn On brings it back", async () => {
    const fake = startExtension({ tabs: [article] })
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

  it('follows the active tab to another site, to a page Zenbu has no part in, and back', async () => {
    const other = { id: 8 }
    const settingsTab = { id: 9 }
    const fake = startExtension({ tabs: [article, other, settingsTab] })
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

    fake.switchTo(settingsTab.id)
    await settle()
    expect(header.querySelector('[role="switch"]')).toBeNull()
    expect(find(await openMenu(header), '[data-site="cant-run"]').textContent).toContain(
      "Zenbu can't run here"
    )

    fake.load({ id: settingsTab.id, url: `https://${host}/news/easy/` })
    await settle()
    expect(header.querySelector(siteSwitchName)).not.toBeNull()
  })

  it.each([
    { name: 'a tab no content script answers from, such as chrome://extensions/', tab: { id: 2 } },
    {
      name: 'the Chrome Web Store',
      tab: { id: 2, url: 'https://chromewebstore.google.com/detail/zenbu/abc' }
    }
  ])("says Zenbu can't run on $name, with no switch", async ({ tab }) => {
    startExtension({ tabs: [tab] })
    const header = await drawHeader()
    expect(header.querySelector('[role="switch"]')).toBeNull()
    const site = find(await openMenu(header), '[data-site]')
    expect(site.getAttribute('data-site')).toBe('cant-run')
    expect(site.textContent).toContain("Zenbu can't run here")
  })

  it("asks Chrome for the site where Chrome's site access keeps Zenbu out", async () => {
    const fake = startExtension({
      tabs: [{ id: 7, url: `https://${host}/news/easy/k10014.html` }],
      allowed: false
    })
    const header = await drawHeader()
    expect(header.querySelector('[role="switch"]')).toBeNull()
    const menu = await openMenu(header)
    expect(find(menu, '[data-site="no-access"]').textContent).toContain(
      "Chrome's site access keeps Zenbu off this site"
    )
    await click(byText(menu, '[role="menuitem"]', 'Allow on This Site'))
    expect(fake.requested).toEqual([[`https://${host}/*`]])
    expect(find(header, siteSwitchName)).toBeTruthy()
  })

  it('opens Settings from its menu', async () => {
    const fake = startExtension({ tabs: [article] })
    const menu = await openMenu(await drawHeader())
    await click(byText(menu, '[role="menuitem"]', 'Settings'))
    expect(fake.opened.optionsPage).toBe(1)
  })

  it('offers Show Welcome Tab only while the dictionary downloads', async () => {
    startExtension({ tabs: [article] })
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
