import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import type { NextConfig } from 'next'
import { accountServiceIn } from './src/lib/account/availability'
import {
  movedDictionarySitemaps,
  writtenDictionarySitemaps
} from './src/lib/dictionary/sitemap-files'
import { defaultLocaleRedirects, defaultLocaleRewrites } from './src/lib/i18n/routing'
import { movedPages, removedDictionaryPages } from './src/lib/moved-pages'
import { isDeployedSite } from './src/lib/site'
import { movedSitemaps } from './src/lib/sitemap'
import { environmentNoindex } from './src/lib/staging-access'

const accountService = accountServiceIn(
  readFileSync(join(process.cwd(), 'wrangler.jsonc'), 'utf8'),
  process.env.SITE_ENV
)

const dictionarySitemaps = writtenDictionarySitemaps(readdirSync(join(process.cwd(), 'public')))

const nextConfig: NextConfig = {
  env: {
    ZENBU_ACCOUNT_PAGES: accountService ? 'open' : 'closed',
    ZENBU_ACCOUNT_SERVICE: accountService ?? '',
    ZENBU_DICTIONARY_SITEMAPS: dictionarySitemaps.join(' ')
  },
  trailingSlash: true,
  experimental: { globalNotFound: true },
  transpilePackages: ['@zenbu/account-rules', '@zenbu/dictionary-core'],
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
    return { beforeFiles: [], afterFiles: [...defaultLocaleRewrites], fallback: [] }
  },
  async headers() {
    if (isDeployedSite()) return []
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: environmentNoindex }] }]
  }
}

export default nextConfig

initOpenNextCloudflareForDev()
