'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ReactNode } from 'react'

const themeScriptProps = {
  type: typeof window === 'undefined' ? 'text/javascript' : 'text/plain',
  'data-cfasync': 'false'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" disableTransitionOnChange scriptProps={themeScriptProps}>
      {children}
    </NextThemesProvider>
  )
}
