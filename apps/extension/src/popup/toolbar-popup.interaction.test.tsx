import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from '../settings/settings-page'
import { readingAidKeys } from '../shared/settings'
import { dictionary, resetDictionary } from '../test/dictionary'
import {
  aidShownOn,
  contentScriptShown,
  startContentScript,
  startExtension
} from '../test/extension'
import { byText, click, find, isOn, type Rendered, render, settle, switchFor } from '../test/render'
import { ToolbarPopup } from './toolbar-popup'

vi.mock('../shared/dictionary', () => import('../test/dictionary'))
vi.mock('../shared/dictionary-progress', () => import('../test/dictionary'))

const host = 'www3.nhk.or.jp'
const article = { id: 7, url: `https://${host}/news/easy/k10014.html`, favIconUrl: '' }

let opened: Rendered[] = []
let contentScripts: (() => void)[] = []

async function openPopup(): Promise<HTMLElement> {
  const popup = render(<ToolbarPopup />)
  opened.push(popup)
  await settle()
  return popup.container
}

async function openSettings(page: string): Promise<HTMLElement> {
  location.hash = page
  const settings = render(<SettingsPage />)
  opened.push(settings)
  await settle()
  return settings.container
}

async function loadContentScript(): Promise<() => void> {
  const stop = startContentScript(host)
  contentScripts.push(stop)
  await settle()
  return stop
}

afterEach(() => {
  for (const stop of contentScripts) stop()
  for (const page of opened) page.unmount()
  contentScripts = []
  opened = []
  resetDictionary()
  location.hash = ''
  vi.restoreAllMocks()
})

describe('the toolbar popup', () => {
  it('turns each reading aid on and off, Settings shows the same, and the open page hears it without a reload', async () => {
    const fake = startExtension({ tab: article })
    await loadContentScript()
    const popup = await openPopup()
    const settings = await openSettings('#reading-aids')
    for (const aid of readingAidKeys) {
      const first = isOn(switchFor(popup, aid))
      for (const shown of [!first, first]) {
        await click(switchFor(popup, aid))
        expect(fake.items[aid]).toBe(shown)
        expect(isOn(switchFor(popup, aid))).toBe(shown)
        expect(isOn(switchFor(settings, aid))).toBe(shown)
        expect(aidShownOn(aid)).toBe(shown)
      }
    }
  })

  it('waits for Furigana before Hide Furigana on Known Words can change', async () => {
    const fake = startExtension({ tab: article })
    const popup = await openPopup()
    await click(switchFor(popup, 'readingAids.furigana'))
    const hide = switchFor(popup, 'readingAids.furiganaHiddenOnKnownWords')
    expect(hide.hasAttribute('data-disabled')).toBe(true)
    await click(hide)
    expect(fake.items['readingAids.furiganaHiddenOnKnownWords']).toBeUndefined()
  })

  it('turns Zenbu off for the site, keeps it off after a reload, lists it under Sites, and Turn On brings it back', async () => {
    const fake = startExtension({ tab: article })
    const stopFirstLoad = await loadContentScript()
    expect(contentScriptShown()).not.toBeNull()

    const popup = await openPopup()
    expect(find(popup, '[data-site-status]').textContent).toBe('Zenbu is on for this site')
    await click(find(popup, `[role="switch"][aria-label="Zenbu on ${host}"]`))
    expect(fake.items['sites.off']).toEqual([host])
    expect(find(popup, '[data-site-status]').textContent).toBe('Zenbu is off for this site')
    expect(contentScriptShown()).toBeNull()

    stopFirstLoad()
    await loadContentScript()
    expect(contentScriptShown()).toBeNull()

    const settings = await openSettings('#sites')
    expect(find(settings, '[data-site-off]').getAttribute('data-site-off')).toBe(host)
    await click(byText(settings, 'button', 'Turn On'))
    expect(fake.items['sites.off']).toEqual([])
    expect(settings.querySelector('[data-site-off]')).toBeNull()
    expect(contentScriptShown()).not.toBeNull()
    expect(isOn(find(popup, `[role="switch"][aria-label="Zenbu on ${host}"]`))).toBe(true)
  })

  it.each([
    'chrome://extensions/',
    'https://chromewebstore.google.com/detail/zenbu/abc'
  ])("says Zenbu can't run on %s, with no switch", async url => {
    startExtension({ tab: { id: 2, url } })
    const popup = await openPopup()
    expect(find(popup, '[data-site="restricted"]').textContent).toContain("Zenbu can't run here")
    expect(find(popup, '[data-site]').querySelector('[role="switch"]')).toBeNull()
  })

  it("asks Chrome for the site where Chrome's site access keeps Zenbu out", async () => {
    const fake = startExtension({ tab: article, allowed: false })
    const popup = await openPopup()
    expect(find(popup, '[data-site="no-access"]')).toBeTruthy()
    await click(byText(popup, 'button', 'Allow on This Site'))
    expect(fake.requested).toEqual([[`https://${host}/*`]])
    expect(find(popup, '[data-site="open"]')).toBeTruthy()
  })

  it('opens the side panel and closes', async () => {
    const fake = startExtension({ tab: article })
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined)
    const popup = await openPopup()
    await click(byText(popup, 'button', 'Open Side Panel'))
    expect(fake.sent).toContainEqual({ target: 'service-worker', openPanel: {} })
    expect(close).toHaveBeenCalled()
  })

  it('opens Settings from the gear', async () => {
    const fake = startExtension({ tab: article })
    const popup = await openPopup()
    await click(find(popup, 'button[aria-label="Settings"]'))
    expect(fake.opened.optionsPage).toBe(1)
  })

  it('shows the download and Show Welcome Tab only while the dictionary downloads', async () => {
    startExtension({ tab: article })
    resetDictionary({ state: 'ready', release: '2026-10-01', bytes: 1, checkedAt: null })
    const ready = await openPopup()
    expect(ready.querySelector('[data-dictionary-download]')).toBeNull()

    resetDictionary({ state: 'downloading', done: 10, total: 100 })
    const downloading = await openPopup()
    const download = find(downloading, '[data-dictionary-download]')
    expect(download.querySelector('[data-test="dictionary-progress"]')).not.toBeNull()
    await click(byText(download, 'button', 'Show Welcome Tab'))
    expect(dictionary.welcomeTabs).toBe(1)
  })
})
