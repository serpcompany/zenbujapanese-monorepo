'use client'

import { Volume2Icon } from 'lucide-react'
import { Button } from '../components/button'

export type OnUnsupported = (message: string) => void

export function speakJapanese(text: string, unsupported: string, onUnsupported: OnUnsupported) {
  if (!('speechSynthesis' in window)) {
    onUnsupported(unsupported)
    return
  }
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'ja-JP'
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
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
