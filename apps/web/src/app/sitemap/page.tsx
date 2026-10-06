import { PageList } from '@/components/page-list'
import { pageMetadata } from '@/lib/metadata'
import { sitePages } from '@/lib/pages'

export const metadata = pageMetadata('/sitemap/')

export default function HtmlSitemapPage() {
  return <PageList title="Sitemap" pages={sitePages} />
}
