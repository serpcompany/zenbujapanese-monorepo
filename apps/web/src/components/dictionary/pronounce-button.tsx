'use client'

import { Volume2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export function speakJapanese(text: string) {
  if (!('speechSynthesis' in window)) {
    toast.error("This browser can't pronounce Japanese.")
    return
  }
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'ja-JP'
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}

export function PronounceButton({ text, label = 'Pronounce' }: { text: string; label?: string }) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label={label} onClick={() => speakJapanese(text)}>
      <Volume2Icon />
    </Button>
  )
}
