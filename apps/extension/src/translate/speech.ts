import { bestLocalVoice } from '@zenbu/ui/dictionary/voice'
import type { Language } from '../translation/messages'

const appLocale: Record<Language, string> = { ja: 'ja-JP', en: 'en-US' }

const localVoiceFor = (language: Language) =>
  bestLocalVoice(speechSynthesis.getVoices(), appLocale[language])

export const onDeviceSpeech = {
  localVoice: (language: Language) => localVoiceFor(language)?.name ?? null,
  watchVoices(onChange: () => void) {
    speechSynthesis.addEventListener('voiceschanged', onChange)
    return () => speechSynthesis.removeEventListener('voiceschanged', onChange)
  },
  speak(text: string, language: Language) {
    const voice = localVoiceFor(language)
    if (!voice) return
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.voice = voice
    utterance.lang = voice.lang
    speechSynthesis.cancel()
    speechSynthesis.speak(utterance)
  }
}
