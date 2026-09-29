import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@/components/analytics'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { Toaster } from '@/components/ui/sonner'
import { readingAidsScript } from '@/lib/reading-aids'
import { site } from '@/lib/site'
import './globals.css'

const geistSans = Geist({ variable: '--font-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: site.name, template: `%s | ${site.name}` },
  description: site.description,
  openGraph: { siteName: site.name, type: 'website', locale: 'en_US' }
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // The Reading Aids script sets its attributes on <html> before hydration.
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          // Reading Aids apply before the page paints (lib/reading-aids.ts).
          // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant script of our own
          dangerouslySetInnerHTML={{ __html: readingAidsScript }}
        />
      </head>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        {children}
        <SiteFooter />
        <Toaster />
        <Analytics />
      </body>
    </html>
  )
}
