'use client'

import { useEffect } from 'react'
import { askForSearch, takeAskedSearch } from '@/lib/account/asked-search'
import type { Locale } from '@/lib/i18n/config'

const refinementLink = '[data-section="readingRefinement"] a'

export function RecordSearch({
  query,
  refinement,
  locale
}: {
  query: string
  refinement: string | null
  locale: Locale
}) {
  useEffect(() => {
    if (takeAskedSearch() !== query) return
    void import('@/lib/account/recent-searches').then(({ recordSearch }) =>
      recordSearch(query, locale)
    )
  }, [query, locale])

  useEffect(() => {
    if (refinement === null) return
    const asked = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest(refinementLink)) {
        askForSearch(refinement)
      }
    }
    document.addEventListener('click', asked)
    return () => document.removeEventListener('click', asked)
  }, [refinement])

  return null
}
