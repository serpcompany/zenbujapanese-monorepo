export const site = {
  name: 'Zenbu Japanese',
  mark: '全',
  description:
    'An offline-first Japanese dictionary, image-text reader, and translator for iPhone.',
  url: 'https://zenbujapanese.com',
  supportEmail: 'support@zenbujapanese.com',
  appUrl: '/'
} as const

export function isProductionSite() {
  return process.env.SITE_ENV === 'production'
}

export function isDeployedSite() {
  return process.env.SITE_ENV === 'staging' || process.env.SITE_ENV === 'production'
}

export function absoluteUrl(path: string) {
  return new URL(path, site.url).toString()
}
