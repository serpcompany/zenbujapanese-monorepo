'use client'

import { useEffect, useState } from 'react'

export function useBusy(): [boolean, (busy: boolean) => void] {
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const backFromAnotherPage = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(false)
    }
    window.addEventListener('pageshow', backFromAnotherPage)
    return () => window.removeEventListener('pageshow', backFromAnotherPage)
  }, [])
  return [busy, setBusy]
}
