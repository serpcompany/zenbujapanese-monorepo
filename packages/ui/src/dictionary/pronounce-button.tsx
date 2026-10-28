'use client'

import { Volume2Icon } from 'lucide-react'
import { createContext, useContext, useEffect } from 'react'
import { Button } from '../components/button'
import { bestLocalVoice, voiceToSpeak, type WithoutLocalVoice } from './voice'

export type OnUnsupported = (message: string) => void

const appSpeechRate = 0.82
const voicesLoadLimitMs = 1000

const WithoutLocalVoiceContext = createContext<WithoutLocalVoice>('browser-voice')

export const PronounceWithoutLocalVoice = WithoutLocalVoiceContext.Provider

export function useWithoutLocalVoice(): WithoutLocalVoice {
  useEffect(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.getVoices()
  }, [])
  return useContext(WithoutLocalVoiceContext)
}

let stopWaiting: (() => void) | undefined

function withLoadedVoices(
  synthesis: SpeechSynthesis,
  lang: string,
  use: (voices: readonly SpeechSynthesisVoice[]) => void
) {
  stopWaiting?.()
  const voices = synthesis.getVoices()
  if (voices.length > 0) {
    use(voices)
    return
  }
  const stop = () => {
    clearTimeout(limit)
    synthesis.removeEventListener('voiceschanged', changed)
    stopWaiting = undefined
  }
  const loaded = () => {
    stop()
    use(synthesis.getVoices())
  }
  const changed = () => {
    if (bestLocalVoice(synthesis.getVoices(), lang)) loaded()
  }
  const limit = setTimeout(loaded, voicesLoadLimitMs)
  synthesis.addEventListener('voiceschanged', changed)
  stopWaiting = stop
}

export function speak(
  text: string,
  lang: string,
  unsupported: string,
  onUnsupported: OnUnsupported,
  withoutLocalVoice: WithoutLocalVoice
) {
  if (!('speechSynthesis' in window)) {
    onUnsupported(unsupported)
    return
  }
  const synthesis = window.speechSynthesis
  withLoadedVoices(synthesis, lang, voices => {
    const voice = voiceToSpeak(voices, lang, withoutLocalVoice)
    if (voice === 'unsupported') {
      onUnsupported(unsupported)
      return
    }
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    utterance.voice = voice
    utterance.rate = appSpeechRate
    synthesis.cancel()
    synthesis.speak(utterance)
  })
}

export function speakJapanese(
  text: string,
  unsupported: string,
  onUnsupported: OnUnsupported,
  withoutLocalVoice: WithoutLocalVoice
) {
  speak(text, 'ja-JP', unsupported, onUnsupported, withoutLocalVoice)
}

export function PronounceButton({
  text,
  label,
  unsupported,
  onUnsupported
}: {
  text: string
  label: string
  unsupported: string
  onUnsupported: OnUnsupported
}) {
  const withoutLocalVoice = useWithoutLocalVoice()
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      onClick={() => speakJapanese(text, unsupported, onUnsupported, withoutLocalVoice)}
    >
      <Volume2Icon />
    </Button>
  )
}
