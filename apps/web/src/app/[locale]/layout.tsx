import type { Metadata } from 'next'
import { SiteDocument } from '@/components/site-document'
import { locales } from '@/lib/i18n/config'
import { localeOf } from '@/lib/i18n/params'
import { siteMetadata } from '@/lib/metadata'
import { fontClassName } from '../fonts'
import '../globals.css'

export function generateStaticParams() {
  return locales.map(locale => ({ locale }))
}

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>): Promise<Metadata> {
  return siteMetadata(await localeOf(params))
}

export default async function RootLayout({ children, params }: LayoutProps<'/[locale]'>) {
  return (
    <SiteDocument locale={await localeOf(params)} fontClassName={fontClassName}>
      {children}
    </SiteDocument>
  )
}
