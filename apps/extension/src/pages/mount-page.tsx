import '../styles/pages.css'
import type { ReactNode } from 'react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { followSystemColorScheme } from '../shared/color-scheme'
import { addGeist } from '../shared/geist'

export function mountPage(title: string, page: ReactNode): void {
  document.title = title
  addGeist()
  followSystemColorScheme(document.documentElement)
  const container = document.body.appendChild(document.createElement('div'))
  createRoot(container).render(<StrictMode>{page}</StrictMode>)
}

export function PageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex flex-col gap-4 p-4">
      <h1 className="font-heading text-lg font-semibold">{title}</h1>
      {children}
    </main>
  )
}
