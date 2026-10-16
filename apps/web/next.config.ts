import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import type { NextConfig } from 'next'
import { accountServiceIn } from './src/lib/account/availability'
import { dictionarySitemapFiles, movedDictionarySitemaps } from './src/lib/dictionary/sitemap-files'
import { defaultLocaleRedirects, defaultLocaleRewrites } from './src/lib/i18n/routing'
import { movedPages, removedDictionaryPages } from './src/lib/moved-pages'
import { isProductionSite } from './src/lib/site'
import { movedSitemaps } from './src/lib/sitemap'

const accountService = accountServiceIn(
  readFileSync(join(process.cwd(), 'wrangler.jsonc'), 'utf8'),
  process.env.SITE_ENV
)

const nextConfig: NextConfig = {
  env: {
    ZENBU_ACCOUNT_PAGES: accountService ? 'open' : 'closed',
    ZENBU_ACCOUNT_SERVICE: accountService ?? ''
  },
  trailingSlash: true,
  experimental: { globalNotFound: true },
  transpilePackages: ['@zenbu/dictionary-core'],
  turbopack: { root: join(process.cwd(), '../..') },
  async redirects() {
    return [
      ...defaultLocaleRedirects.map(rule => ({ ...rule, permanent: true })),
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
    return {
      beforeFiles: [],
      afterFiles: [...dictionarySitemapFiles, ...defaultLocaleRewrites],
      fallback: []
    }
  },
  async headers() {
    if (isProductionSite()) return []
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }]
  }
}

export default nextConfig

initOpenNextCloudflareForDev()
