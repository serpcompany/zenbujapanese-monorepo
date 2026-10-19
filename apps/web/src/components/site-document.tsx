import type { ReactNode } from 'react'
import { Analytics } from '@/components/analytics'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import type { Locale } from '@/lib/i18n/config'

export function SiteDocument({
  locale,
  fontClassName,
  children
}: {
  locale: Locale
  fontClassName: string
  children: ReactNode
}) {
  return (
    <html
      lang={locale}
      className={`${fontClassName} h-full scroll-pt-16 antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <SiteHeader locale={locale} />
          {children}
          <SiteFooter locale={locale} />
          <Toaster />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
