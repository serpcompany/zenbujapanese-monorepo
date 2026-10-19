import type { Metadata } from 'next'
import { NotFoundMessage } from '@/components/not-found-message'
import { SiteDocument } from '@/components/site-document'
import { defaultLocale } from '@/lib/i18n/config'
import { siteMetadata } from '@/lib/metadata'
import { fontClassName } from './fonts'
import './globals.css'

export const metadata: Metadata = siteMetadata(defaultLocale)

export default function GlobalNotFound() {
  return (
    <SiteDocument locale={defaultLocale} fontClassName={fontClassName}>
      <NotFoundMessage locale={defaultLocale} />
    </SiteDocument>
  )
}
