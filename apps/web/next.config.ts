import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import type { NextConfig } from 'next'
import { isProductionSite } from './src/lib/site'

const wwwHost = { type: 'host', value: 'www.zenbujapanese.com' } as const

const nextConfig: NextConfig = {
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
      // The shipped iOS app and App Store metadata link to /privacy.
      { source: '/privacy', destination: '/legal/privacy', permanent: true }
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
