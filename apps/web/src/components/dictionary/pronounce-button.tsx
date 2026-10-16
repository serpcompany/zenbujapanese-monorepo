'use client'

import { Volume2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export function speakJapanese(text: string, unsupported: string) {
  if (!('speechSynthesis' in window)) {
    toast.error(unsupported)
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
  unsupported
}: {
  text: string
  label: string
  unsupported: string
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      onClick={() => speakJapanese(text, unsupported)}
    >
      <Volume2Icon />
    </Button>
  )
}
