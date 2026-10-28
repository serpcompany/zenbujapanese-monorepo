'use client'

import { Volume2Icon } from 'lucide-react'
import { Button } from '../components/button'
import { bestLocalVoice } from './voice'

export type OnUnsupported = (message: string) => void

const appSpeechRate = 0.82
const voicesLoadLimitMs = 1000

function withLoadedVoices(
  synthesis: SpeechSynthesis,
  use: (voices: readonly SpeechSynthesisVoice[]) => void
) {
  const voices = synthesis.getVoices()
  if (voices.length > 0) {
    use(voices)
    return
  }
  const loaded = () => {
    clearTimeout(limit)
    synthesis.removeEventListener('voiceschanged', loaded)
    use(synthesis.getVoices())
  }
  const limit = setTimeout(loaded, voicesLoadLimitMs)
  synthesis.addEventListener('voiceschanged', loaded)
}

export function speak(
  text: string,
  lang: string,
  unsupported: string,
  onUnsupported: OnUnsupported
) {
  if (!('speechSynthesis' in window)) {
    onUnsupported(unsupported)
    return
  }
  const synthesis = window.speechSynthesis
  withLoadedVoices(synthesis, voices => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    utterance.voice = bestLocalVoice(voices, lang)
    utterance.rate = appSpeechRate
    synthesis.cancel()
    synthesis.speak(utterance)
  })
}

export function speakJapanese(text: string, unsupported: string, onUnsupported: OnUnsupported) {
  speak(text, 'ja-JP', unsupported, onUnsupported)
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
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      onClick={() => speakJapanese(text, unsupported, onUnsupported)}
    >
      <Volume2Icon />
    </Button>
  )
}
