import { movedPath } from './moved-pages'
import { productionOrigin, stagingOrigin } from './origins'

export const smokeTestHeader = 'x-zenbu-smoke-test'

const wwwHost = 'www.zenbujapanese.com'
const workersDevHost = /\.workers\.dev$/
const file = /\/[^/]+\.\w+\/?$/

function canonicalPath(pathname: string): string {
  const moved = movedPath(pathname)
  if (moved) return moved
  if (file.test(pathname)) return pathname.replace(/\/$/, '')
  return pathname.endsWith('/') ? pathname : `${pathname}/`
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
