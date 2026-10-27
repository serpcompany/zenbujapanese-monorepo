import { followSettings, ReadingAidStates } from '../../test-pages/settings-follower'
import { hostElementName, mountInShadowRoot } from '../content/shadow-mount'
import { startSettingsChannel } from '../service-worker/settings'
import { fakeChrome } from './fake-chrome'

class FakeFontFace {
  constructor(readonly family: string) {}
}

export function startExtension(options?: Parameters<typeof fakeChrome>[0]) {
  const fake = fakeChrome(options)
  Object.assign(globalThis, { chrome: fake.chrome, FontFace: FakeFontFace })
  startSettingsChannel()
  return fake
}

export function startContentScript(host: string): () => void {
  return followSettings(
    settings =>
      mountInShadowRoot(<ReadingAidStates settings={settings} />, {
        fonts: { add: () => undefined }
      }),
    host
  )
}

export const contentScriptShown = () =>
  document
    .querySelector(hostElementName)
    ?.shadowRoot?.querySelector('[data-test="reading-aids"]') ?? null

export const aidShownOn = (aid: string) =>
  contentScriptShown()?.querySelector(`[data-reading-aid="${aid}"]`)?.getAttribute('data-on') ===
  'true'
