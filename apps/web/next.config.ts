import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import type { NextConfig } from 'next'
import { isProductionSite } from './src/lib/site'

const nextConfig: NextConfig = {
  turbopack: {
    // Keep lockfiles outside apps/web from changing the workspace root.
    root: process.cwd()
  },
  async redirects() {
    return [
      // The shipped iOS app and App Store metadata link to /privacy.
      { source: '/privacy', destination: '/legal/privacy', permanent: true }
    ]
  },
  async headers() {
    if (isProductionSite) return []
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }]
  }
}

export default nextConfig

// Lets `next dev` read Cloudflare bindings through getCloudflareContext().
initOpenNextCloudflareForDev()
