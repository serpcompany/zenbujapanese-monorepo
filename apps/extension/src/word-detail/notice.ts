import { createContext, useContext } from 'react'

export type Notify = (message: string, clearWhen?: (clear: () => void) => void) => void

export type Notices = {
  notify: Notify
  copy(text: string, copied: string): Promise<void>
}

const NoticesContext = createContext<Notices | null>(null)

export const NoticesProvider = NoticesContext.Provider

export function useNotices(): Notices {
  const notices = useContext(NoticesContext)
  if (!notices)
    throw new Error('Word Detail is drawn only inside a word popup, which gives notices.')
  return notices
}
