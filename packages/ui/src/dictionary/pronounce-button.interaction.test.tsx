import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { PronounceButton, PronounceWithoutLocalVoice } from './pronounce-button'
import type { Voice, WithoutLocalVoice } from './voice'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

type Utterance = { text: string; lang: string; voice: Voice | null; rate: number }

class StandInSpeech extends EventTarget {
  voices: Voice[] = []
  readonly speaking: Utterance[] = []
  readonly asked = vi.fn()
  readonly cancel = vi.fn(() => {
    this.speaking.length = 0
  })
  getVoices() {
    this.asked()
    return this.voices
  }
  speak(utterance: Utterance) {
    this.speaking.push(utterance)
  }
  load(voices: Voice[]) {
    this.voices = voices
    this.dispatchEvent(new Event('voiceschanged'))
  }
}

const networkVoice = { name: 'Google 日本語', lang: 'ja-JP', localService: false }
const compactVoice = { name: 'Otoya', lang: 'ja-JP', localService: true }
const enhancedVoice = { name: 'Otoya (Enhanced)', lang: 'ja-JP', localService: true }
const voices = [networkVoice, compactVoice, enhancedVoice].map(voice => ({
  ...voice,
  voiceURI: voice.name
}))
const [google, , otoyaEnhanced] = voices

let speech: StandInSpeech
let root: Root
let onUnsupported: ReturnType<typeof vi.fn<(message: string) => void>>

beforeEach(() => {
  speech = new StandInSpeech()
  onUnsupported = vi.fn()
  vi.stubGlobal('speechSynthesis', speech)
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      lang = ''
      voice = null
      rate = 1
      constructor(readonly text: string) {}
    }
  )
  const mount = document.createElement('div')
  document.body.append(mount)
  root = createRoot(mount)
})

afterEach(() => {
  act(() => root.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const unsupported = "This browser can't pronounce Japanese."

function speakersWhere(withoutLocalVoice: WithoutLocalVoice, ...texts: string[]) {
  act(() =>
    root.render(
      <PronounceWithoutLocalVoice value={withoutLocalVoice}>
        {texts.map(text => (
          <PronounceButton
            key={text}
            text={text}
            label={`Pronounce ${text}`}
            unsupported={unsupported}
            onUnsupported={onUnsupported}
          />
        ))}
      </PronounceWithoutLocalVoice>
    )
  )
  return texts.map(text => {
    const button = document.querySelector<HTMLButtonElement>(`[aria-label="Pronounce ${text}"]`)
    if (!button) throw new Error(`No speaker for ${text}`)
    return button
  })
}

const speakers = (...texts: string[]) => speakersWhere('browser-voice', ...texts)

const spoken = (text: string, voice: Voice | null) => ({ text, lang: 'ja-JP', voice, rate: 0.82 })

describe('pronouncing Japanese', () => {
  test('speaks in the best voice on this computer, in ja-JP, at 0.82 of the default rate', () => {
    speech.voices = voices
    const [table] = speakers('テーブル')
    act(() => table.click())
    expect(speech.speaking).toEqual([spoken('テーブル', otoyaEnhanced)])
  })

  test('on the website, speaks in the browser’s own ja-JP voice when no Japanese voice is on this computer', () => {
    speech.voices = [google]
    const [table] = speakers('テーブル')
    act(() => table.click())
    expect(speech.speaking).toEqual([spoken('テーブル', null)])
    expect(onUnsupported).not.toHaveBeenCalled()
  })

  test('in the extension, says it can’t pronounce Japanese and speaks nothing when no Japanese voice is on this computer', () => {
    speech.voices = [google]
    const [table] = speakersWhere('unsupported', 'テーブル')
    act(() => table.click())
    expect(speech.speaking).toEqual([])
    expect(speech.cancel).not.toHaveBeenCalled()
    expect(onUnsupported).toHaveBeenCalledExactlyOnceWith(unsupported)
  })

  test('in the extension, still speaks in the best voice on this computer', () => {
    speech.voices = voices
    const [table] = speakersWhere('unsupported', 'テーブル')
    act(() => table.click())
    expect(speech.speaking).toEqual([spoken('テーブル', otoyaEnhanced)])
    expect(onUnsupported).not.toHaveBeenCalled()
  })

  test('asks for the voices when a speaker appears, so the first click finds them', () => {
    speakers('テーブル')
    expect(speech.asked).toHaveBeenCalled()
  })

  test('a second click while the first speaks stops it and says the new text in full', () => {
    speech.voices = voices
    const [table, eat] = speakers('テーブル', '食べる')
    act(() => table.click())
    act(() => eat.click())
    expect(speech.cancel).toHaveBeenCalledTimes(2)
    expect(speech.speaking).toEqual([spoken('食べる', otoyaEnhanced)])
  })

  test('a click before the voices load waits for them, then speaks in the best one', () => {
    const [table] = speakers('テーブル')
    act(() => table.click())
    expect(speech.speaking).toEqual([])
    act(() => speech.load(voices))
    expect(speech.speaking).toEqual([spoken('テーブル', otoyaEnhanced)])
    act(() => speech.load(voices))
    expect(speech.speaking).toHaveLength(1)
  })

  test('a click before the voices load keeps waiting while only network voices are listed', () => {
    const [table] = speakersWhere('unsupported', 'テーブル')
    act(() => table.click())
    act(() => speech.load([google]))
    expect(speech.speaking).toEqual([])
    expect(onUnsupported).not.toHaveBeenCalled()
    act(() => speech.load(voices))
    expect(speech.speaking).toEqual([spoken('テーブル', otoyaEnhanced)])
  })

  test('two clicks before the voices load speak only the second word', () => {
    const [table, eat] = speakers('テーブル', '食べる')
    act(() => table.click())
    act(() => eat.click())
    act(() => speech.load(voices))
    expect(speech.speaking).toEqual([spoken('食べる', otoyaEnhanced)])
  })

  test('a click waiting for the voices never speaks the older word after a later click finds them', () => {
    vi.useFakeTimers()
    const [table, eat] = speakers('テーブル', '食べる')
    act(() => table.click())
    speech.voices = voices
    act(() => eat.click())
    act(() => speech.load(voices))
    act(() => vi.advanceTimersByTime(1000))
    expect(speech.speaking).toEqual([spoken('食べる', otoyaEnhanced)])
  })

  test.each<WithoutLocalVoice>([
    'browser-voice',
    'unsupported'
  ])('with %s, a click speaks in the browser’s own voice after a second when the voices never load, and only once', withoutLocalVoice => {
    vi.useFakeTimers()
    const [table] = speakersWhere(withoutLocalVoice, 'テーブル')
    act(() => table.click())
    act(() => vi.advanceTimersByTime(999))
    expect(speech.speaking).toEqual([])
    act(() => vi.advanceTimersByTime(1))
    expect(speech.speaking).toEqual([spoken('テーブル', null)])
    act(() => speech.load(voices))
    expect(speech.speaking).toHaveLength(1)
  })

  test('in the extension, a click says it can’t pronounce Japanese when a second passes with only network voices', () => {
    vi.useFakeTimers()
    const [table] = speakersWhere('unsupported', 'テーブル')
    act(() => table.click())
    act(() => speech.load([google]))
    act(() => vi.advanceTimersByTime(1000))
    expect(speech.speaking).toEqual([])
    expect(onUnsupported).toHaveBeenCalledExactlyOnceWith(unsupported)
  })
})
