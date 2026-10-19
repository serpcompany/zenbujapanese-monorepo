import { servedPath } from './i18n/routing'
import { movedPath } from './moved-pages'
import { productionOrigin, stagingOrigin } from './origins'

export const smokeTestHeader = 'x-zenbu-smoke-test'

const wwwHost = 'www.zenbujapanese.com'
const workersDevHost = /\.workers\.dev$/

function canonicalPath(pathname: string): string {
  return movedPath(pathname) ?? servedPath(pathname)
}

function canonicalOrigin(request: Request, hostname: string, siteEnv: string | undefined) {
  if (hostname === wwwHost) return productionOrigin
  if (!workersDevHost.test(hostname) || request.headers.has(smokeTestHeader)) return null
  return siteEnv === 'production' ? productionOrigin : stagingOrigin
}

export function otherHostResponse(request: Request, siteEnv: string | undefined): Response | null {
  const url = new URL(request.url)
  const origin = canonicalOrigin(request, url.hostname, siteEnv)
  if (!origin) return null
  return Response.redirect(`${origin}${canonicalPath(url.pathname)}${url.search}`, 308)
}
