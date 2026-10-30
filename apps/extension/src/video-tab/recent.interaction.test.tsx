import { afterEach, describe, expect, it, vi } from 'vitest'
import { askAccount } from '../shared/account'
import { labels as panelLabels } from '../side-panel/labels'
import { keptSessionRoutes, signedInAnswer, startAccountOn } from '../test/account-stand-in'
import { settle } from '../test/render'
import { watching } from '../test/video-tab-harness'

let tab: ReturnType<typeof watching> | undefined

afterEach(() => {
  tab?.unmount()
  tab = undefined
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

const recent = (shown: NonNullable<typeof tab>) => shown.panel.querySelector('[data-recent]')
const offers = (shown: NonNullable<typeof tab>) =>
  [...(recent(shown)?.querySelectorAll('button') ?? [])].map(button => button.textContent)
const explains = (shown: NonNullable<typeof tab>) =>
  recent(shown)?.querySelector('[data-slot="empty-description"]')?.textContent

describe("Player's Recent, on a tab with no video", () => {
  it('offers Sign up or sign in signed out, and explains Recent signed in, following sign-in and sign-out with the panel open', async () => {
    tab = watching({ url: 'https://www.youtube.com/results?search_query=japanese' })
    startAccountOn(tab.extension, {
      'POST /v1/auth/sign-in/extension-code': () => signedInAnswer('session-website'),
      ...keptSessionRoutes
    })
    await tab.show(true)
    await settle()
    expect(offers(tab)).toEqual([panelLabels.signUp])
    expect(explains(tab)).toBe(panelLabels.empty.recent.description)

    await tab.extension
      .fromPage('https://zenbujapanese.com')
      .sendMessage({ type: 'sign-in', code: 'website-code' })
    await settle()
    expect(offers(tab)).toEqual([])
    expect(explains(tab)).toBe(panelLabels.empty.recentSignedIn.description)

    await askAccount({ account: 'sign-out' })
    await settle()
    expect(offers(tab)).toEqual([panelLabels.signUp])
    expect(explains(tab)).toBe(panelLabels.empty.recent.description)
  })

  it('shows neither the signed-out text nor the sign-in offer while the account is still loading', async () => {
    tab = watching({ url: 'https://www.youtube.com/results?search_query=japanese' })
    tab.extension.chrome.runtime.onMessage.addListener(message =>
      (message as { account?: unknown }).account ? true : undefined
    )
    await tab.show(true)
    await settle()
    expect(recent(tab)?.querySelector('h2')?.textContent).toBe(panelLabels.recent)
    expect(offers(tab)).toEqual([])
    expect(explains(tab)).toBeUndefined()
  })
})
