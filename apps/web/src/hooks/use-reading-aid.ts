'use client'

import { useSyncExternalStore } from 'react'
import {
  onReadingAidsChange,
  type ReadingAid,
  readingAidShown,
  readingAidShownByDefault,
  showReadingAid
} from '@/lib/reading-aids'

export function useReadingAid(id: ReadingAid) {
  const shown = useSyncExternalStore(
    onReadingAidsChange,
    () => readingAidShown(id),
    () => readingAidShownByDefault(id)
  )
  return [shown, (next: boolean) => showReadingAid(id, next)] as const
}
