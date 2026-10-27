import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TestSurface } from '../../test-pages/test-surface'
import { hostElementName, mountInShadowRoot, type ShadowMount } from './shadow-mount'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

class FakeFontFace {
  constructor(
    readonly family: string,
    readonly source: string
  ) {}
}

function darkQuery(matches: boolean) {
  const listeners = new Set<() => void>()
  return {
    matches,
    addEventListener(_: 'change', listener: () => void) {
      listeners.add(listener)
    },
    removeEventListener(_: 'change', listener: () => void) {
      listeners.delete(listener)
    },
    change(next: boolean) {
      this.matches = next
      for (const listener of listeners) listener()
    }
  }
}

let mounted: ShadowMount | undefined
let fonts: FakeFontFace[]

beforeEach(() => {
  vi.stubGlobal('FontFace', FakeFontFace)
  fonts = []
})

afterEach(() => {
  act(() => mounted?.unmount())
  mounted = undefined
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

function mount(query = darkQuery(false)) {
  act(() => {
    mounted = mountInShadowRoot(<TestSurface ask={() => new Promise(() => {})} />, {
      darkQuery: query,
      fonts: { add: font => fonts.push(font as unknown as FakeFontFace) }
    })
  })
  return mounted as ShadowMount
}

describe('mountInShadowRoot', () => {
  it('draws inside its own shadow root, not in the page', () => {
    const { host, shadowRoot } = mount()
    expect(document.querySelector(hostElementName)).toBe(host)
    expect(shadowRoot.querySelector('[data-test="card"]')).not.toBeNull()
    expect(document.querySelector('[data-test="card"]')).toBeNull()
    expect(shadowRoot.querySelector('style')).not.toBeNull()
  })

  it('adds Geist to the page under its own family, so the page font of the same name is untouched', () => {
    mount()
    expect(fonts.map(font => font.family)).toEqual(['Zenbu Geist', 'Zenbu Geist'])
  })

  it('follows the system colour scheme on the surface, not on the page', () => {
    const query = darkQuery(false)
    const { shadowRoot } = mount(query)
    const surface = shadowRoot.querySelector('style')?.nextElementSibling
    expect(surface?.classList.contains('dark')).toBe(false)
    act(() => query.change(true))
    expect(surface?.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('opens the dialog inside the shadow root, where its styles are', async () => {
    const { shadowRoot } = mount()
    const trigger = shadowRoot.querySelector<HTMLButtonElement>('[data-test="dialog-trigger"]')
    await act(async () => trigger?.click())
    expect(shadowRoot.querySelector('[data-test="dialog"]')).not.toBeNull()
    expect(document.querySelector('[data-test="dialog"]')).toBeNull()
  })

  it('takes everything out of the page when it unmounts', () => {
    const shown = mount()
    act(() => shown.unmount())
    mounted = undefined
    expect(document.querySelector(hostElementName)).toBeNull()
  })
})
