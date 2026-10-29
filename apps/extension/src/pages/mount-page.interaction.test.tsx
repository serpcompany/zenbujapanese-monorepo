import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../test/act-environment'
import { cantPronounce, speakerWithOnlyANetworkVoice } from '../test/network-voice-only'
import { mountPage } from './mount-page'

afterEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

describe('an extension page', () => {
  it('says it can’t pronounce Japanese, and speaks nothing, when the computer has only a network voice', async () => {
    vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn(async () => undefined) } })
    vi.stubGlobal('FontFace', class {})
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { add: vi.fn(), [Symbol.iterator]: () => [][Symbol.iterator]() }
    })
    const { speaker, spoken, said } = speakerWithOnlyANetworkVoice()
    await act(async () => mountPage('Zenbu Japanese', speaker))
    act(() => document.querySelector<HTMLButtonElement>('button')?.click())
    expect(said).toHaveBeenCalledExactlyOnceWith(cantPronounce, expect.any(Function))
    expect(spoken).not.toHaveBeenCalled()
  })
})
