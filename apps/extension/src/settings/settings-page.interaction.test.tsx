import { creditsShownBy } from '@zenbu/dictionary-core/sources/credits'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { accountLabels } from '../account/labels'
import { AccountTab } from '../side-panel/account-tab'
import {
  json,
  jwtWith,
  signedInAnswer,
  startAccountOn,
  subscription,
  user
} from '../test/account-stand-in'
import { dictionary, resetDictionary } from '../test/dictionary'
import { startExtension } from '../test/extension'
import {
  byText,
  click,
  find,
  isOn,
  type Rendered,
  render,
  settle,
  switchFor,
  typeInto
} from '../test/render'
import { SettingsPage } from './settings-page'

vi.mock('../shared/dictionary', () => import('../test/dictionary'))
vi.mock('../shared/dictionary-progress', () => import('../test/dictionary'))

const jlpt = 'zenbu.jlpt.waller.levels'
const youtube = 'zenbu.tubelex.youtube.ja.unidic-3.1'

let opened: Rendered | undefined

let panel: Rendered | undefined

async function openSettings(page = ''): Promise<HTMLElement> {
  location.hash = page
  opened = render(<SettingsPage />)
  await settle()
  return opened.container
}

const pageShown = (settings: HTMLElement) =>
  find(settings, '[data-settings-page]').getAttribute('data-settings-page')

afterEach(() => {
  opened?.unmount()
  opened = undefined
  panel?.unmount()
  panel = undefined
  resetDictionary()
  location.hash = ''
})

describe('Settings', () => {
  it('opens each of its six pages from the sidebar, one at a time', async () => {
    startExtension()
    const settings = await openSettings()
    expect(pageShown(settings)).toBe('reading-aids')
    const pages = [
      ['Frequency Dictionaries', 'frequency-dictionaries'],
      ['Dictionary Data', 'dictionary-data'],
      ['Sites', 'sites'],
      ['Account', 'account'],
      ['Credits', 'credits'],
      ['Reading Aids', 'reading-aids']
    ]
    for (const [title, id] of pages) {
      await click(byText(find(settings, 'nav'), 'a', title as string))
      expect(pageShown(settings)).toBe(id)
      expect(find(settings, 'main h2').textContent).toBe(title)
      expect(find(settings, 'nav [aria-current="page"]').textContent).toBe(title)
      expect(settings.querySelectorAll('main')).toHaveLength(1)
    }
  })

  it('keeps Reading Aids, Page Text, Zenbu Captions, and Send Crash Reports on one page, each with a stock switch', async () => {
    startExtension()
    const settings = await openSettings('#reading-aids')
    for (const setting of [
      'readingAids.furigana',
      'readingAids.furiganaHiddenOnKnownWords',
      'readingAids.wordMeanings',
      'readingAids.romaji',
      'readingAids.translations',
      'pages.pageText',
      'videos.zenbuCaptions',
      'crashReports.send'
    ]) {
      expect(switchFor(settings, setting).getAttribute('data-slot')).toBe('switch')
    }
    expect([...settings.querySelectorAll('main h3')].map(heading => heading.textContent)).toEqual([
      'Pages',
      'Videos',
      'Crash Reports'
    ])
    const pageText = switchFor(settings, 'pages.pageText')
    expect(isOn(pageText)).toBe(true)
    expect(
      find(settings, `#${CSS.escape(pageText.getAttribute('aria-describedby') ?? '')}`).textContent
    ).toBe("On every site, underlines and reading aids on the page's Japanese text.")
    expect(settings.textContent).not.toContain('Translation source')
  })

  it('sends crash reports at first and stores false when they are turned off', async () => {
    const fake = startExtension()
    const settings = await openSettings('#reading-aids')
    const crashReports = switchFor(settings, 'crashReports.send')
    expect(isOn(crashReports)).toBe(true)
    const detail = find(
      settings,
      `#${CSS.escape(crashReports.getAttribute('aria-describedby') ?? '')}`
    )
    expect(detail.textContent).toContain('Sentry')
    expect(detail.textContent).toContain('never include your searches')
    await click(crashReports)
    expect(fake.items['crashReports.send']).toBe(false)
    expect(isOn(switchFor(settings, 'crashReports.send'))).toBe(false)
  })

  it('moves YouTube above JLPT Levels, which changes the chosen order', async () => {
    const fake = startExtension()
    const settings = await openSettings('#frequency-dictionaries')
    const rows = () =>
      [...settings.querySelectorAll('[data-frequency]')].map(row =>
        row.getAttribute('data-frequency')
      )
    expect(rows()).toEqual([jlpt, youtube])
    expect(
      find(settings, 'button[aria-label="Move JLPT Levels up"]').hasAttribute('disabled')
    ).toBe(true)
    await click(find(settings, 'button[aria-label="Move YouTube up"]'))
    expect(fake.items['frequencyDictionaries.chosen']).toEqual([youtube, jlpt])
    expect(fake.items['frequencyDictionaries.order']).toEqual([youtube, jlpt])
    expect(rows()).toEqual([youtube, jlpt])
    await click(find(settings, '[role="switch"][aria-label="JLPT Levels"]'))
    expect(fake.items['frequencyDictionaries.chosen']).toEqual([youtube])
    expect(rows()).toEqual([youtube, jlpt])
  })

  it('shows the installed release, and sends one update check for one click', async () => {
    startExtension()
    resetDictionary({
      state: 'ready',
      release: '2026-10-01',
      bytes: 48_200_000,
      checkedAt: Date.UTC(2026, 9, 27, 12)
    })
    const settings = await openSettings('#dictionary-data')
    const terms = [...settings.querySelectorAll('dt')].map(term => term.textContent)
    expect(terms).toEqual(['Release', 'Size', 'Last checked'])
    expect(settings.querySelector('dd')?.textContent).toBe('2026-10-01')
    await click(byText(settings, 'button', 'Check for Updates'))
    expect(dictionary.checks).toBe(1)
  })

  it('draws the shared progress while the dictionary downloads, and Check for Updates waits', async () => {
    startExtension()
    resetDictionary({ state: 'downloading', done: 5, total: 50 })
    const settings = await openSettings('#dictionary-data')
    expect(find(settings, '[data-test="dictionary-progress"]').textContent).toBe('downloading')
    expect(settings.querySelector('dl')).toBeNull()
    expect(byText(settings, 'button', 'Check for Updates').hasAttribute('disabled')).toBe(true)
  })

  it('says Zenbu is on everywhere when no site is turned off', async () => {
    startExtension()
    const settings = await openSettings('#sites')
    expect(settings.querySelector('[data-site-off]')).toBeNull()
    expect(byText(settings, 'main p', 'Zenbu is on for every site it can run on.')).toBeTruthy()
  })

  it('turns Zenbu on for every site from Sites, and says so once Chrome allows it', async () => {
    const extension = startExtension()
    const settings = await openSettings('#sites')
    expect(find(settings, '[data-every-site]').getAttribute('data-every-site')).toBe('off')
    await click(byText(settings, 'button', 'Turn On for Every Site'))
    expect(extension.requested).toEqual([['http://*/*', 'https://*/*']])
    expect(find(settings, '[data-every-site]').textContent).toBe(
      'Zenbu can underline Japanese on every site.'
    )
    extension.revoke(['http://*/*', 'https://*/*'])
    await settle()
    expect(find(settings, '[data-every-site]').getAttribute('data-every-site')).toBe('off')
  })

  it('credits every source the core lists for the extension, with its link', async () => {
    startExtension()
    const settings = await openSettings('#credits')
    const shown = creditsShownBy('extension')
    expect(shown.credits.length).toBeGreaterThan(0)
    expect(byText(settings, 'main p', shown.conversionNotice)).toBeTruthy()
    expect(settings.querySelectorAll('main li')).toHaveLength(shown.credits.length)
    for (const source of shown.credits) {
      expect(byText(settings, 'main li a', source.name).getAttribute('href')).toBe(source.url)
    }
  })

  it("shows the same account as the side panel's Account tab, and signing in on either shows on both", async () => {
    const fake = startExtension()
    startAccountOn(fake, {
      'POST /v1/auth/email-otp/send-verification-otp': () => json(200, { success: true }),
      'POST /v1/auth/sign-in/email-otp': () => signedInAnswer('session-1'),
      'GET /v1/auth/token': () => json(200, { token: jwtWith(Date.now() / 1000 + 3600) }),
      'GET /v1/me/subscription': () => json(200, subscription),
      'POST /v1/auth/sign-out': () => json(200, { success: true })
    })
    const settings = await openSettings('#account')
    panel = render(<AccountTab />)
    await settle()
    const page = find(settings, 'main')
    const tab = panel.container
    const drawn = (scope: HTMLElement) =>
      find(scope, '[data-account]').innerHTML.replaceAll(/ (id|for)="[^"]*"/g, '')
    expect(find(page, '[data-account]').getAttribute('data-account')).toBe('signed-out')
    expect(drawn(page)).toBe(drawn(tab))
    typeInto(find(tab, 'input[type="email"]'), user.email)
    await click(byText(tab, 'button', accountLabels.sendCode))
    typeInto(find(tab, 'input[autocomplete="one-time-code"]'), '123456')
    await click(byText(tab, 'button', accountLabels.signIn))
    for (const scope of [page, tab]) {
      expect(find(scope, '[data-account-email]').textContent).toBe(user.email)
    }
    await click(byText(page, 'button', accountLabels.signOut))
    for (const scope of [page, tab]) {
      expect(find(scope, '[data-account]').textContent).toContain(accountLabels.signedOut.title)
    }
  })
})
