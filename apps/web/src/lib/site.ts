export const site = {
  name: 'Zenbu Japanese',
  mark: '全',
  description:
    'An offline-first Japanese dictionary, image-text reader, and translator for iPhone.',
  url: 'https://zenbujapanese.com',
  supportEmail: 'support@serp.co'
} as const

/**
 * Only `pnpm deploy:production` builds with SITE_ENV=production. Every other build (local,
 * staging, previews) is kept out of search engines.
 */
export const isProductionSite = process.env.SITE_ENV === 'production'

export function absoluteUrl(path: string) {
  return new URL(path, site.url).toString()
}
