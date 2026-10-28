'use client'

import type { ReactNode } from 'react'
import { askForSearch } from '@/lib/account/asked-search'

export function SearchSubmission({ action, children }: { action: string; children: ReactNode }) {
  return (
    <form
      action={action}
      method="get"
      onSubmit={event => askForSearch(String(new FormData(event.currentTarget).get('q') ?? ''))}
    >
      {children}
    </form>
  )
}
