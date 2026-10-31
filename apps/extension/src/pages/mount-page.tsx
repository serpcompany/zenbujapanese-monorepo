import '../styles/pages.css'
import { PronounceWithoutLocalVoice } from '@zenbu/ui/dictionary/pronounce-button'
import type { ReactNode } from 'react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { startErrorReports } from '../error-reports/error-reports'
import { toServiceWorker } from '../error-reports/forwarding'
import { followSystemColorScheme } from '../shared/color-scheme'
import { addGeist } from '../shared/geist'

export function mountPage(title: string, page: ReactNode): void {
  startErrorReports('page', toServiceWorker(chrome.runtime))
  document.title = title
  addGeist()
  followSystemColorScheme(document.documentElement)
  const container = document.body.appendChild(document.createElement('div'))
  createRoot(container).render(
    <StrictMode>
      <PronounceWithoutLocalVoice value="unsupported">{page}</PronounceWithoutLocalVoice>
    </StrictMode>
  )
}
