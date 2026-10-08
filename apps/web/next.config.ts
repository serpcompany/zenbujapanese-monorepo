import { join } from 'node:path'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import type { NextConfig } from 'next'
import type { Redirect } from 'next/dist/lib/load-custom-routes'
import { dictionarySitemapFiles, movedDictionarySitemaps } from './src/lib/dictionary/sitemap-files'
import { movedPages, removedDictionaryPages } from './src/lib/moved-pages'
import { isProductionSite, productionOrigin, stagingOrigin } from './src/lib/site'
import { movedSitemaps } from './src/lib/sitemap'

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
    return [
      ...redirectHostTo(
        isProductionSite() ? productionOrigin : stagingOrigin,
        [workersDevHost],
        [smokeTest]
      ),
      ...redirectHostTo(productionOrigin, [wwwHost]),
      ...[...movedSitemaps, ...movedDictionarySitemaps].map(rule => ({ ...rule, permanent: true })),
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
      ...Object.entries(movedPages).map(([source, destination]) => ({
        source,
        destination,
        permanent: true
      })),
      ...removedDictionaryPages.map(rule => ({ ...rule, permanent: true }))
    ]
  },
  async rewrites() {
    return [...dictionarySitemapFiles]
  },
  async headers() {
    if (isProductionSite()) return []
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }]
  }
}

export default nextConfig

initOpenNextCloudflareForDev()
