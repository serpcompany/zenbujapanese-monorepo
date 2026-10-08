import { dictionarySitemapPaths } from './dictionary/sitemaps'
import { servedOrigin } from './site'
import { childSitemaps, sitemapIndexXml, xmlResponse } from './sitemap'

export async function sitemapIndexResponse(request: Request) {
  const paths = [...childSitemaps, ...(await dictionarySitemapPaths())]
  return xmlResponse(sitemapIndexXml(paths, servedOrigin(request)))
}
