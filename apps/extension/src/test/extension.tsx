import { followSettings, ReadingAidStates } from '../../test-pages/settings-follower'
import { hostElementName, mountInShadowRoot } from '../content/shadow-mount'
import { startSettingsChannel } from '../service-worker/settings'
import { answerSiteRequests } from '../shared/page-site'
import { fakeChrome } from './fake-chrome'

class FakeFontFace {
  constructor(readonly family: string) {}
}

export type FakeExtension = ReturnType<typeof fakeChrome>

export function startExtension(options?: Parameters<typeof fakeChrome>[0]): FakeExtension {
  const fake = fakeChrome(options)
  Object.assign(globalThis, { chrome: fake.chrome, FontFace: FakeFontFace })
  startSettingsChannel()
  return fake
}

export function startContentScript(fake: FakeExtension, tabId: number, host: string): () => void {
  const runtime = fake.inTab(tabId)
  const stopAnswering = answerSiteRequests(host, runtime.onMessage)
  const stopFollowing = followSettings(
    settings =>
      mountInShadowRoot(<ReadingAidStates settings={settings} />, {
        fonts: { add: () => undefined }
      }),
    host,
    runtime
  )
  return () => {
    stopAnswering()
    stopFollowing()
  }
}

export const contentScriptShown = () =>
  document
    .querySelector(hostElementName)
    ?.shadowRoot?.querySelector('[data-test="reading-aids"]') ?? null

export const aidShownOn = (aid: string) =>
  contentScriptShown()?.querySelector(`[data-reading-aid="${aid}"]`)?.getAttribute('data-on') ===
  'true'
