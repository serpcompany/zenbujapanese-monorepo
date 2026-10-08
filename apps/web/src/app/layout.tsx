import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import { Analytics } from '@/components/analytics'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { Toaster } from '@/components/ui/sonner'
import { siteOpenGraph } from '@/lib/metadata'
import { site, siteOrigin } from '@/lib/site'
import './globals.css'

const geistSans = Geist({ variable: '--font-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(siteOrigin()),
    title: { default: site.name, template: `%s | ${site.name}` },
    description: site.description,
    openGraph: siteOpenGraph
  }
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" disableTransitionOnChange>
          <SiteHeader />
          {children}
          <SiteFooter />
          <Toaster />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
