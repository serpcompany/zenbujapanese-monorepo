import type { Language } from '../translation/messages'

type Voice = Pick<SpeechSynthesisVoice, 'lang' | 'localService'>

const speaks = (voice: Voice, language: Language) =>
  voice.lang.toLowerCase().replace('_', '-').split('-')[0] === language

export const localVoiceAmong = <V extends Voice>(voices: readonly V[], language: Language) =>
  voices.find(voice => voice.localService && speaks(voice, language)) ?? null

const localVoiceFor = (language: Language) => localVoiceAmong(speechSynthesis.getVoices(), language)

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
