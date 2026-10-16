import { SiteTree } from '@/components/site-tree'
import { dictionaryTreeIn, homeTreeIn } from '@/lib/dictionary/browse/site-tree'
import { localeOf } from '@/lib/i18n/params'
import { pageMetadata } from '@/lib/metadata'
import { pageFor } from '@/lib/pages'

export async function generateMetadata({ params }: PageProps<'/[locale]/sitemap'>) {
  return pageMetadata('/sitemap/', await localeOf(params))
}

export default async function HtmlSitemapPage({ params }: PageProps<'/[locale]/sitemap'>) {
  const locale = await localeOf(params)
  return (
    <SiteTree
      title={pageFor('/sitemap/', locale).title}
      trees={[homeTreeIn(locale), dictionaryTreeIn(locale)]}
      locale={locale}
    />
  )
}
