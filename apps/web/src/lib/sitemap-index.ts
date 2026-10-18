import { servedOrigin } from './site'
import { childSitemaps, sitemapIndexXml, xmlResponse } from './sitemap'

const writtenDictionarySitemaps = () =>
  (process.env.ZENBU_DICTIONARY_SITEMAPS ?? '').split(' ').filter(Boolean)

export function sitemapIndexResponse(request: Request) {
  const paths = [...childSitemaps, ...writtenDictionarySitemaps()]
  return xmlResponse(sitemapIndexXml(paths, servedOrigin(request)))
}
