import { join } from 'node:path'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import type { NextConfig } from 'next'
import type { Redirect } from 'next/dist/lib/load-custom-routes'
import { isProductionSite } from './src/lib/site'

const wwwHost = { type: 'host', value: 'www.zenbujapanese.com' } as const

// workers.dev hosts redirect to the environment's branded domain, except requests carrying the
// smoke-test header: Bot Fight Mode on the zone blocks CI runners, so CI tests the Worker there.
// The header is not a secret; it only reveals the same public site on another host.
export const smokeTestHeader = 'x-zenbu-smoke-test'
const workersDevHost = { type: 'host', value: '(?<worker>.+)\\.workers\\.dev' } as const
const smokeTest = { type: 'header', key: smokeTestHeader } as const

type HostRedirectCondition = NonNullable<Redirect['has']>[number]

/**
 * Redirects every path on the matching host to `origin`, in one hop to the canonical form: pages
 * keep their trailing slash and files never get one. Files come first because `/:path+` would
 * also match them, and `/` has its own rule because OpenNext cannot fill an empty path.
 */
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
  // SERP URL trailing-slash standard: pages end in / (/about/); files never do (/robots.txt).
  trailingSlash: true,
  // The shared dictionary core (@zenbu/dictionary-core, packages/dictionary-core) is TypeScript
  // source, compiled with the site.
  transpilePackages: ['@zenbu/dictionary-core'],
  // The pnpm workspace's root, where its lockfile is: Turbopack reads the core from there, and
  // OpenNext finds the site's standalone build under it (.next/standalone/apps/web).
  turbopack: { root: join(process.cwd(), '../..') },
  async redirects() {
    const canonicalOrigin = isProductionSite()
      ? 'https://zenbujapanese.com'
      : 'https://staging.zenbujapanese.com'
    return [
      ...redirectHostTo(canonicalOrigin, [workersDevHost], [smokeTest]),
      // www serves the same Worker.
      ...redirectHostTo('https://zenbujapanese.com', [wwwHost]),
      // Files never end in a slash: /robots.txt/ -> /robots.txt. Next.js does this itself, but
      // OpenNext skips it, so repeat it here. Two rules: OpenNext cannot fill an empty path.
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
      // The shipped iOS app and App Store metadata link to /privacy.
      { source: '/privacy', destination: '/legal/privacy/', permanent: true }
    ]
  },
  async headers() {
    if (isProductionSite()) return []
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }]
  }
}

export default nextConfig

// Lets `next dev` read Cloudflare bindings through getCloudflareContext().
initOpenNextCloudflareForDev()
