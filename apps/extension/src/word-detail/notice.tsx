import { useCallback, useState } from 'react'
import { wordDetailLabels } from './labels'

export type Notify = (message: string) => void

export function useNotice(): [string | null, Notify] {
  const [notice, setNotice] = useState<string | null>(null)
  return [notice, useCallback((message: string) => setNotice(message), [])]
}

export function Notice({ notice }: { notice: string | null }) {
  return (
    <output className="block text-sm text-muted-foreground empty:hidden" data-notice>
      {notice}
    </output>
  )
}

export async function copyText(text: string, copied: string, notify: Notify) {
  try {
    await navigator.clipboard.writeText(text)
    notify(copied)
  } catch {
    notify(wordDetailLabels.copyFailed)
  }
}
