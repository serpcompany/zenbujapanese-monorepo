import { PronounceWithoutLocalVoice } from '@zenbu/ui/dictionary/pronounce-button'
import { PortalContainer } from '@zenbu/ui/lib/portal'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { followSystemColorScheme, systemDarkQuery } from '../shared/color-scheme'
import { addGeist } from '../shared/geist'
import shadowCss from '../styles/shadow.css?inline'

export const hostElementName = 'zenbu-japanese'

const surfaceText = 'font-sans text-base tracking-normal text-foreground antialiased'

type Options = {
  document?: Document
  darkQuery?: Parameters<typeof followSystemColorScheme>[1]
  fonts?: Parameters<typeof addGeist>[0]
  report?: (error: unknown) => void
}

export type ShadowMount = { host: HTMLElement; shadowRoot: ShadowRoot; unmount(): void }

export function mountInShadowRoot(content: ReactNode, options: Options = {}): ShadowMount {
  const doc = options.document ?? document
  addGeist(options.fonts ?? doc.fonts)
  const host = doc.createElement(hostElementName)
  const shadowRoot = host.attachShadow({ mode: 'open' })
  const style = doc.createElement('style')
  style.textContent = shadowCss
  const surface = doc.createElement('div')
  surface.className = surfaceText
  const container = surface.appendChild(doc.createElement('div'))
  shadowRoot.append(style, surface)
  ;(doc.body ?? doc.documentElement).append(host)
  const stopFollowing = followSystemColorScheme(surface, options.darkQuery ?? systemDarkQuery())
  const { report } = options
  const handle = (error: unknown) => {
    report?.(error)
    console.error(error)
  }
  const root = createRoot(container, { onUncaughtError: handle, onCaughtError: handle })
  root.render(
    <PortalContainer value={surface}>
      <PronounceWithoutLocalVoice value="unsupported">{content}</PronounceWithoutLocalVoice>
    </PortalContainer>
  )
  return {
    host,
    shadowRoot,
    unmount() {
      root.unmount()
      stopFollowing()
      host.remove()
    }
  }
}
