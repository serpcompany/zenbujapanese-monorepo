import { SiteTree } from '@/components/site-tree'
import { dictionaryTree, homeTree } from '@/lib/dictionary/browse/site-tree'
import { pageMetadata } from '@/lib/metadata'

export const metadata = pageMetadata('/sitemap/')

export default function HtmlSitemapPage() {
  return <SiteTree title="Sitemap" trees={[homeTree, dictionaryTree]} />
}
