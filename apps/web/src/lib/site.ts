export const site = {
  name: 'Zenbu Japanese',
  mark: '全',
  description:
    'An offline-first Japanese dictionary, image-text reader, and translator for iPhone.',
  url: 'https://zenbujapanese.com',
  supportEmail: 'support@zenbujapanese.com'
} as const

/**
 * Production is marked by SITE_ENV=production both at build time (`pnpm deploy:production`, for
 * next.config headers) and at runtime (the production Worker var in wrangler.jsonc, for anything
 * rendered on request). Everything else is kept out of search engines.
 */
export function isProductionSite() {
  return process.env.SITE_ENV === 'production'
}

export function absoluteUrl(path: string) {
  return new URL(path, site.url).toString()
}
