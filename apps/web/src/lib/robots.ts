import { absoluteUrl, isProductionSite, isStagingSite, servedOrigin } from './site'

const siteAuditor = 'AhrefsSiteAudit'

const productionRules = 'Allow: /'

function groups(): string[] {
  if (isProductionSite()) return [`User-Agent: *\n${productionRules}`]
  const closed = 'User-Agent: *\nDisallow: /'
  return isStagingSite() ? [closed, `User-Agent: ${siteAuditor}\n${productionRules}`] : [closed]
}

export function robotsTxt(request: Request) {
  const sitemap = absoluteUrl('/sitemap-index.xml', servedOrigin(request))
  return `${[...groups(), `Sitemap: ${sitemap}`].join('\n\n')}\n`
}
