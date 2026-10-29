import { afterEach, describe, expect, it, vi } from 'vitest'
import { onDeviceSpeech } from './speech'

const googleJapanese = { name: 'Google 日本語', lang: 'ja-JP', localService: false }
const kyoko = { name: 'Kyoko', lang: 'ja-JP', localService: true }
const kyokoEnhanced = { name: 'Kyoko (Enhanced)', lang: 'ja-JP', localService: true }
const googleEnglish = { name: 'Google US English', lang: 'en-US', localService: false }
const samantha = { name: 'Samantha', lang: 'en_US', localService: true }
const matildaEnhanced = { name: 'Matilda (Enhanced)', lang: 'en-AU', localService: true }

function standInSpeech(voices: (typeof kyoko)[]) {
  const speech = {
    getVoices: () => voices.map(voice => ({ ...voice, voiceURI: voice.name })),
    speak: vi.fn(),
    cancel: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }
  vi.stubGlobal('speechSynthesis', speech)
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      voice: unknown = null
      lang = ''
      constructor(readonly text: string) {}
    }
  )
  return speech
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the voice Speak uses', () => {
  it('is one on this computer, never a remote one, though the remote one comes first', () => {
    standInSpeech([googleJapanese, kyoko, googleEnglish, samantha])
    expect(onDeviceSpeech.localVoice('ja')).toBe('Kyoko')
    expect(onDeviceSpeech.localVoice('en')).toBe('Samantha')
  })

  it('is the best one on this computer, as a word’s Pronounce chooses it', () => {
    standInSpeech([googleJapanese, kyoko, kyokoEnhanced])
    expect(onDeviceSpeech.localVoice('ja')).toBe('Kyoko (Enhanced)')
  })

  it('is one of the app’s region, US English, before a better one of another', () => {
    standInSpeech([matildaEnhanced, samantha])
    expect(onDeviceSpeech.localVoice('en')).toBe('Samantha')
  })

  it('speaks with the local voice', () => {
    const speech = standInSpeech([googleJapanese, kyoko])
    onDeviceSpeech.speak('トイレはどこですか', 'ja')
    expect(speech.speak).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'トイレはどこですか',
        voice: expect.objectContaining({ name: 'Kyoko' }),
        lang: 'ja-JP'
      })
    )
  })

  it('says nothing when no voice on this computer speaks the language', () => {
    const speech = standInSpeech([googleEnglish, kyoko])
    expect(onDeviceSpeech.localVoice('en')).toBeNull()
    onDeviceSpeech.speak('Where is the toilet?', 'en')
    expect(speech.speak).not.toHaveBeenCalled()
  })

  it('watches for Chrome’s voices to load, and stops', () => {
    const speech = standInSpeech([])
    const changed = vi.fn()
    const stop = onDeviceSpeech.watchVoices(changed)
    expect(speech.addEventListener).toHaveBeenCalledWith('voiceschanged', changed)
    stop()
    expect(speech.removeEventListener).toHaveBeenCalledWith('voiceschanged', changed)
  })
})
