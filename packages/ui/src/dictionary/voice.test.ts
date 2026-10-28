import { describe, expect, test } from 'vitest'
import { bestLocalVoice, type Voice, voiceToSpeak } from './voice'

const onThisComputer = (name: string, lang = 'ja-JP', voiceURI = name): Voice => ({
  name,
  lang,
  voiceURI,
  localService: true
})

const googleJapanese: Voice = {
  name: 'Google 日本語',
  lang: 'ja-JP',
  voiceURI: 'Google 日本語',
  localService: false
}
const eddy = onThisComputer('Eddy (日本語（日本）)')
const kyoko = onThisComputer('Kyoko')
const kyokoEnhanced = onThisComputer('Kyoko (Enhanced)')
const otoyaPremium = onThisComputer('Otoya (Premium)')
const samantha = onThisComputer('Samantha', 'en_US')

describe('the voice that pronounces a word', () => {
  test('is an enhanced voice on this computer before a compact one, never a network voice', () => {
    expect(bestLocalVoice([googleJapanese, kyoko, kyokoEnhanced, samantha], 'ja-JP')).toBe(
      kyokoEnhanced
    )
  })

  test('is a premium voice before an enhanced one', () => {
    expect(bestLocalVoice([kyokoEnhanced, otoyaPremium, kyoko], 'ja-JP')).toBe(otoyaPremium)
  })

  test('knows a voice’s quality by its Japanese name or by Safari’s voice URI', () => {
    const kakuchou = onThisComputer('Kyoko（拡張）')
    const safariPremium = onThisComputer('Kyoko', 'ja-JP', 'com.apple.voice.premium.ja-JP.Kyoko')
    expect(bestLocalVoice([kyoko, kakuchou], 'ja-JP')).toBe(kakuchou)
    expect(bestLocalVoice([kakuchou, safariPremium], 'ja-JP')).toBe(safariPremium)
  })

  test('is a compact voice before an Eloquence voice, though the Eloquence one comes first', () => {
    const chromeFlo = onThisComputer('Flo (Japanese (Japan))')
    const safariFlo = onThisComputer('Flo', 'ja-JP', 'com.apple.eloquence.ja-JP.Flo')
    expect(bestLocalVoice([eddy, chromeFlo, safariFlo, kyoko], 'ja-JP')).toBe(kyoko)
  })

  test('is an Eloquence voice when that is all this computer has', () => {
    expect(bestLocalVoice([googleJapanese, eddy], 'ja-JP')).toBe(eddy)
  })

  test('is the first of equal voices, in the browser’s order', () => {
    const otoya = onThisComputer('Otoya')
    expect(bestLocalVoice([otoya, kyoko], 'ja-JP')).toBe(otoya)
  })

  test('is none when only a network voice speaks the language, or there are no voices', () => {
    expect(bestLocalVoice([googleJapanese, samantha], 'ja-JP')).toBeNull()
    expect(bestLocalVoice([], 'ja-JP')).toBeNull()
  })

  test('speaks the language whatever its separator, or with no region asked for', () => {
    expect(bestLocalVoice([kyoko, samantha], 'en-US')).toBe(samantha)
    expect(bestLocalVoice([samantha, kyoko], 'ja')).toBe(kyoko)
  })

  test('is a voice of the region asked for before a better one of another region', () => {
    const matildaEnhanced = onThisComputer('Matilda (Enhanced)', 'en-AU')
    expect(bestLocalVoice([matildaEnhanced, samantha], 'en-US')).toBe(samantha)
    expect(bestLocalVoice([samantha, matildaEnhanced], 'en')).toBe(matildaEnhanced)
    expect(bestLocalVoice([googleJapanese, matildaEnhanced], 'en-US')).toBe(matildaEnhanced)
  })
})

describe('the voice to speak in', () => {
  test('is the best local voice under either rule', () => {
    expect(voiceToSpeak([googleJapanese, kyoko], 'ja-JP', 'unsupported')).toBe(kyoko)
    expect(voiceToSpeak([googleJapanese, kyoko], 'ja-JP', 'browser-voice')).toBe(kyoko)
  })

  test('with only a network voice, is the browser’s own on the website and none in the extension', () => {
    expect(voiceToSpeak([googleJapanese], 'ja-JP', 'browser-voice')).toBeNull()
    expect(voiceToSpeak([googleJapanese], 'ja-JP', 'unsupported')).toBe('unsupported')
  })

  test('with no voices listed at all, is the browser’s own under either rule', () => {
    expect(voiceToSpeak([], 'ja-JP', 'browser-voice')).toBeNull()
    expect(voiceToSpeak([], 'ja-JP', 'unsupported')).toBeNull()
  })
})
