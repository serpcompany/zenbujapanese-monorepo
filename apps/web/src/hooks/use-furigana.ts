'use client'

import type { RubySegment } from '@zenbu/dictionary-core/detail/ruby'
import { useCallback, useEffect, useRef, useState } from 'react'
import { composedText, type FuriganaSample, furiganaReadingsUrl } from '@/lib/tools/furigana-tool'

const typingPause = 300

export type FuriganaStatus = 'shown' | 'reading' | 'failed' | 'tooLong' | 'empty'

export function useFurigana(text: string, limit: number, sample: FuriganaSample) {
  const known = useRef(new Map([[sample.text, sample.furigana]]))
  const pending = useRef<AbortController | null>(null)
  const [shown, setShown] = useState<FuriganaSample>(sample)
  const [status, setStatus] = useState<FuriganaStatus>('shown')

  const read = useCallback(async (composed: string) => {
    pending.current?.abort()
    const request = new AbortController()
    pending.current = request
    setStatus('reading')
    try {
      const response = await fetch(furiganaReadingsUrl(composed), { signal: request.signal })
      if (!response.ok) throw new Error(`The furigana route answered ${response.status}`)
      const { furigana } = (await response.json()) as { furigana: RubySegment[] }
      known.current.set(composed, furigana)
      setShown({ text: composed, furigana })
      setStatus('shown')
    } catch {
      if (!request.signal.aborted) setStatus('failed')
    }
  }, [])

  useEffect(() => {
    pending.current?.abort()
    const composed = composedText(text)
    const remembered = known.current.get(composed)
    if (composed.trim() === '') {
      setStatus('empty')
      return
    }
    if (Array.from(composed).length > limit) {
      setStatus('tooLong')
      return
    }
    if (remembered) {
      setShown({ text: composed, furigana: remembered })
      setStatus('shown')
      return
    }
    setStatus('reading')
    const waiting = setTimeout(() => read(composed), typingPause)
    return () => clearTimeout(waiting)
  }, [text, limit, read])

  useEffect(() => () => pending.current?.abort(), [])

  return {
    shown: status === 'shown' || status === 'reading' ? shown : null,
    status,
    retry: () => read(composedText(text))
  }
}
