export const site = {
  name: 'Zenbu Japanese',
  mark: '全',
  description:
    'An offline-first Japanese dictionary, image-text reader, and translator for iPhone.',
  url: 'https://zenbujapanese.com',
  supportEmail: 'support@zenbujapanese.com'
} as const

export const placeholderHref = '#'

type OutsideLink = {
  id: string
  kind: 'app' | 'social'
  name: string
  href: string
}

const outsideLinks = [
  { id: 'app-store', kind: 'app', name: 'App Store', href: placeholderHref },
  { id: 'youtube', kind: 'social', name: 'YouTube', href: placeholderHref },
  { id: 'x', kind: 'social', name: 'X', href: placeholderHref },
  { id: 'instagram', kind: 'social', name: 'Instagram', href: placeholderHref },
  { id: 'tiktok', kind: 'social', name: 'TikTok', href: placeholderHref },
  { id: 'discord', kind: 'social', name: 'Discord', href: placeholderHref },
  { id: 'reddit', kind: 'social', name: 'Reddit', href: placeholderHref },
  { id: 'threads', kind: 'social', name: 'Threads', href: placeholderHref },
  { id: 'bluesky', kind: 'social', name: 'Bluesky', href: placeholderHref },
  { id: 'linkedin', kind: 'social', name: 'LinkedIn', href: placeholderHref },
  { id: 'facebook', kind: 'social', name: 'Facebook', href: placeholderHref }
] as const satisfies readonly OutsideLink[]

export type OutsideLinkId = (typeof outsideLinks)[number]['id']

export type SocialLink = Extract<(typeof outsideLinks)[number], { kind: 'social' }>

export const socialLinks = outsideLinks.filter((link): link is SocialLink => link.kind === 'social')

function outsideLinkFor(id: OutsideLinkId) {
  const link = outsideLinks.find(candidate => candidate.id === id)
  if (!link) throw new Error(`Unknown outside link: ${id}`)
  return link
}

export const appStoreLink = outsideLinkFor('app-store')

export const placeholderLinks: readonly OutsideLink[] = outsideLinks.filter(
  link => link.href === placeholderHref
)

export function isProductionSite() {
  return process.env.SITE_ENV === 'production'
}

export function isDeployedSite() {
  return process.env.SITE_ENV === 'staging' || process.env.SITE_ENV === 'production'
}

export function absoluteUrl(path: string) {
  return new URL(path, site.url).toString()
}
