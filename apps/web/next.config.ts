import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import type { NextConfig } from 'next'
import { isProductionSite } from './src/lib/site'

const wwwHost = { type: 'host', value: 'www.zenbujapanese.com' } as const

const nextConfig: NextConfig = {
  // SERP URL trailing-slash standard: pages end in / (/about/); files never do (/robots.txt).
  trailingSlash: true,
  turbopack: {
    // Keep lockfiles outside apps/web from changing the workspace root.
    root: process.cwd()
  },
  async redirects() {
    return [
      // www serves the same Worker; send it to the apex first, in a single hop.
      { source: '/', has: [wwwHost], destination: 'https://zenbujapanese.com/', permanent: true },
      {
        source: '/:path+',
        has: [wwwHost],
        destination: 'https://zenbujapanese.com/:path+',
        permanent: true
      },
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
