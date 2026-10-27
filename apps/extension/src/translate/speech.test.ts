import { afterEach, describe, expect, it, vi } from 'vitest'
import { localVoiceAmong, onDeviceSpeech } from './speech'

const googleJapanese = { name: 'Google 日本語', lang: 'ja-JP', localService: false }
const kyoko = { name: 'Kyoko', lang: 'ja-JP', localService: true }
const googleEnglish = { name: 'Google US English', lang: 'en-US', localService: false }
const samantha = { name: 'Samantha', lang: 'en_US', localService: true }

function standInSpeech(voices: (typeof kyoko)[]) {
  const speech = {
    getVoices: () => voices,
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
    expect(localVoiceAmong([googleJapanese, kyoko, googleEnglish, samantha], 'ja')).toBe(kyoko)
    expect(localVoiceAmong([googleJapanese, kyoko, googleEnglish, samantha], 'en')).toBe(samantha)
  })

  it('is none when only a remote voice speaks the language', () => {
    expect(localVoiceAmong([googleJapanese, samantha], 'ja')).toBeNull()
  })

  it('speaks with the local voice', () => {
    const speech = standInSpeech([googleJapanese, kyoko])
    expect(onDeviceSpeech.localVoice('ja')).toBe('Kyoko')
    onDeviceSpeech.speak('トイレはどこですか', 'ja')
    expect(speech.speak).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'トイレはどこですか', voice: kyoko, lang: 'ja-JP' })
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
