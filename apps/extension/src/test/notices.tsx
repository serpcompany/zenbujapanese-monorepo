import type { ReactNode } from 'react'
import { vi } from 'vitest'
import { type Notices, NoticesProvider } from '../word-detail/notice'

export function fakeNotices() {
  const notified: string[] = []
  const notices: Notices = {
    notify: message => void notified.push(message),
    copy: vi.fn(async (text: string, copied: string) => {
      await navigator.clipboard.writeText(text)
      notified.push(copied)
    })
  }
  const lastNotice = () =>
    vi.waitFor(() => {
      if (notified.length === 0) throw new Error('Nothing was said')
      return notified.at(-1)
    })
  return { notices, notified, lastNotice }
}

export function WithNotices({ notices, children }: { notices: Notices; children: ReactNode }) {
  return <NoticesProvider value={notices}>{children}</NoticesProvider>
}
