'use client'

import { useEffect, useRef, useState } from 'react'
import type { Dictionary } from '@/lib/i18n/dictionary'

const copyStatusShown = 2_000

export type CopyText = Pick<Dictionary['tools']['converter'], 'copied' | 'selectToCopy'>

export function useCopy(words: CopyText) {
  const [status, setStatus] = useState('')
  const clearing = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(clearing.current), [])
  const copy = async (write: () => Promise<void>) => {
    clearTimeout(clearing.current)
    try {
      await write()
      setStatus(words.copied)
    } catch {
      setStatus(words.selectToCopy)
    }
    clearing.current = setTimeout(() => setStatus(''), copyStatusShown)
  }
  return { status, copy }
}
