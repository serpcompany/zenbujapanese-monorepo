import { absoluteUrl, isProductionSite, servedOrigin } from './site'

export function robotsTxt(request: Request) {
  const rule = isProductionSite() ? 'Allow: /' : 'Disallow: /'
  const sitemap = absoluteUrl('/sitemap-index.xml', servedOrigin(request))
  return `User-Agent: *\n${rule}\n\nSitemap: ${sitemap}\n`
}
