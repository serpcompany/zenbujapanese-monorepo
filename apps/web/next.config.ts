import { join } from 'node:path'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import type { NextConfig } from 'next'
import type { Redirect } from 'next/dist/lib/load-custom-routes'
import { isProductionSite } from './src/lib/site'

const wwwHost = { type: 'host', value: 'www.zenbujapanese.com' } as const

export const smokeTestHeader = 'x-zenbu-smoke-test'
const workersDevHost = { type: 'host', value: '(?<worker>.+)\\.workers\\.dev' } as const
const smokeTest = { type: 'header', key: smokeTestHeader } as const

type HostRedirectCondition = NonNullable<Redirect['has']>[number]

function redirectHostTo(
  origin: string,
  has: HostRedirectCondition[],
  missing: HostRedirectCondition[] = []
): Redirect[] {
  const rule = (source: string, destination: string): Redirect => ({
    source,
    has,
    ...(missing.length ? { missing } : {}),
    destination: `${origin}${destination}`,
    permanent: true
  })
  return [
    rule('/', '/'),
    rule('/:file([^/]+\\.\\w+)', '/:file'),
    rule('/:dir+/:file([^/]+\\.\\w+)', '/:dir+/:file'),
    rule('/:path+', '/:path+/')
  ]
}

const nextConfig: NextConfig = {
  trailingSlash: true,
  transpilePackages: ['@zenbu/dictionary-core'],
  turbopack: { root: join(process.cwd(), '../..') },
  async redirects() {
    const canonicalOrigin = isProductionSite()
      ? 'https://zenbujapanese.com'
      : 'https://staging.zenbujapanese.com'
    return [
      ...redirectHostTo(canonicalOrigin, [workersDevHost], [smokeTest]),
      ...redirectHostTo('https://zenbujapanese.com', [wwwHost]),
      {
        source: '/:file([^/]+\\.\\w+)/',
        destination: '/:file',
        permanent: true
      },
      {
        source: '/:dir+/:file([^/]+\\.\\w+)/',
        destination: '/:dir+/:file',
        permanent: true
      },
      { source: '/privacy', destination: '/legal/privacy/', permanent: true }
    ]
  },
  async headers() {
    if (isProductionSite()) return []
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }]
  }
}

export default nextConfig

initOpenNextCloudflareForDev()
