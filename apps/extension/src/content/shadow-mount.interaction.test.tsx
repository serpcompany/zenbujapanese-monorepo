import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TestSurface, testErrorMessage } from '../../test-pages/test-surface'
import { cantPronounce, speakerWithOnlyANetworkVoice } from '../test/network-voice-only'
import { hostElementName, mountInShadowRoot, type ShadowMount } from './shadow-mount'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

class FakeFontFace {
  constructor(
    readonly family: string,
    readonly source: ArrayBuffer
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
const fontSet = {
  add: (font: FontFace) => fonts.push(font as unknown as FakeFontFace),
  [Symbol.iterator]: () => fonts[Symbol.iterator]()
}

beforeEach(() => {
  vi.stubGlobal('FontFace', FakeFontFace)
  fonts = []
})

afterEach(() => {
  act(() => mounted?.unmount())
  mounted = undefined
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function mount(query = darkQuery(false), report?: (error: unknown) => void) {
  act(() => {
    mounted = mountInShadowRoot(<TestSurface read={() => new Promise(() => {})} />, {
      darkQuery: query,
      fonts: fontSet,
      report
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

  it('adds Geist once per document, however many mounts and content scripts add it', async () => {
    mount()
    act(() => mounted?.unmount())
    mount()
    vi.resetModules()
    const otherScript = await import('../shared/geist')
    otherScript.addGeist(fontSet)
    expect(fonts.map(font => font.family)).toEqual(['Zenbu Geist', 'Zenbu Geist'])
  })

  it('gives Geist its bytes, so the page never loads a file of the extension', () => {
    mount()
    const signatures = fonts.map(font => new TextDecoder().decode(font.source.slice(0, 4)))
    expect(signatures).toEqual(['wOF2', 'wOF2'])
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

  async function throwFromTheSurface(report?: (error: unknown) => void) {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const pageErrors = vi.fn()
    window.addEventListener('error', pageErrors)
    const { shadowRoot } = mount(darkQuery(false), report)
    const trigger = shadowRoot.querySelector<HTMLButtonElement>('[data-test="test-error"]')
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
    try {
      trigger?.click()
      await vi.waitFor(() => expect(logged).toHaveBeenCalled())
    } finally {
      globalThis.IS_REACT_ACT_ENVIRONMENT = true
      window.removeEventListener('error', pageErrors)
    }
    return { logged, pageErrors }
  }

  it("hands an error in its content to the content script's reporter and the console, not to the page", async () => {
    const report = vi.fn()
    const { logged, pageErrors } = await throwFromTheSurface(report)
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: testErrorMessage }))
    expect(logged).toHaveBeenCalledWith(expect.objectContaining({ message: testErrorMessage }))
    expect(pageErrors).not.toHaveBeenCalled()
  })

  it('still logs an error in its content when no reporter is given', async () => {
    const { logged, pageErrors } = await throwFromTheSurface()
    expect(logged).toHaveBeenCalledWith(expect.objectContaining({ message: testErrorMessage }))
    expect(pageErrors).not.toHaveBeenCalled()
  })

  it('takes everything out of the page when it unmounts', () => {
    const shown = mount()
    act(() => shown.unmount())
    mounted = undefined
    expect(document.querySelector(hostElementName)).toBeNull()
  })
})

describe('speaking in a page’s shadow root', () => {
  it('says it can’t pronounce Japanese, and speaks nothing, when the computer has only a network voice', () => {
    const { speaker, spoken, said } = speakerWithOnlyANetworkVoice()
    act(() => {
      mounted = mountInShadowRoot(speaker, { darkQuery: darkQuery(false), fonts: fontSet })
    })
    const button = mounted?.shadowRoot.querySelector<HTMLButtonElement>('button')
    act(() => button?.click())
    expect(said).toHaveBeenCalledExactlyOnceWith(cantPronounce)
    expect(spoken).not.toHaveBeenCalled()
  })
})
