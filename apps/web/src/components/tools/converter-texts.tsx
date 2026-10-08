'use client'

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import type { ConverterSlug } from '@/lib/tools/paths'

type Texts = Partial<Record<ConverterSlug, string>>

interface ConverterTexts {
  texts: Texts
  write: (slug: ConverterSlug, text: string) => void
}

const ConverterTextsContext = createContext<ConverterTexts | null>(null)

export function ConverterTextsProvider({ children }: { children: ReactNode }) {
  const [texts, setTexts] = useState<Texts>({})
  const write = useCallback(
    (slug: ConverterSlug, text: string) => setTexts(current => ({ ...current, [slug]: text })),
    []
  )
  const value = useMemo(() => ({ texts, write }), [texts, write])
  return <ConverterTextsContext value={value}>{children}</ConverterTextsContext>
}

export function useConverterTexts(): ConverterTexts {
  const texts = useContext(ConverterTextsContext)
  if (!texts)
    throw new Error('A converter needs the ConverterTextsProvider of app/tools/layout.tsx')
  return texts
}
