import { accountPagesOpen } from './account/availability'
import { accountPages } from './account/pages'

export const site = {
  name: 'Zenbu Japanese',
  mark: '全',
  description:
    'An offline-first Japanese dictionary, image-text reader, and translator for iPhone.',
  supportEmail: 'support@zenbujapanese.com'
} as const

export const placeholderHref = '#'

type LinkTarget = {
  id: string
  kind: 'page' | 'store' | 'social'
  name: string
  href: string
}

const linkTargets = [
  { id: 'tools', kind: 'page', name: 'Tools index, /tools/', href: placeholderHref },
  {
    id: 'hiragana-to-katakana',
    kind: 'page',
    name: 'Hiragana to Katakana converter',
    href: placeholderHref
  },
  { id: 'romaji-to-kana', kind: 'page', name: 'Romaji to Kana converter', href: placeholderHref },
  {
    id: 'kanji-to-furigana',
    kind: 'page',
    name: 'Kanji to Furigana converter',
    href: placeholderHref
  },
  { id: 'products', kind: 'page', name: 'Products index', href: '/products/' },
  {
    id: 'iphone-app',
    kind: 'page',
    name: 'Zenbu Japanese for iPhone product page',
    href: '/products/zenbu-japanese-for-iphone/'
  },
  {
    id: 'browser-extension',
    kind: 'page',
    name: 'Browser extension product page',
    href: placeholderHref
  },
  { id: 'reference-guides', kind: 'page', name: 'Reference guides', href: placeholderHref },
  { id: 'courses', kind: 'page', name: 'Courses', href: placeholderHref },
  { id: 'videos', kind: 'page', name: 'Videos index, /videos/', href: placeholderHref },
  {
    id: 'login',
    kind: 'page',
    name: 'Log in page, /login/',
    href: accountPagesOpen() ? accountPages.signIn.path : placeholderHref
  },
  {
    id: 'register',
    kind: 'page',
    name: 'Create an account page, /register/',
    href: accountPagesOpen() ? accountPages.register.path : placeholderHref
  },
  { id: 'app-store', kind: 'store', name: 'App Store listing', href: placeholderHref },
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
] as const satisfies readonly LinkTarget[]

export type LinkTargetId = (typeof linkTargets)[number]['id']

export type SocialLink = Extract<(typeof linkTargets)[number], { kind: 'social' }>

export const socialLinks = linkTargets.filter((link): link is SocialLink => link.kind === 'social')

export type LinkTo = { href: string; target?: LinkTargetId }

export function linkTo(id: LinkTargetId): LinkTo {
  const link = linkTargets.find(candidate => candidate.id === id)
  if (!link) throw new Error(`Unknown link target: ${id}`)
  return { href: link.href, target: id }
}

export const placeholderLinks: readonly LinkTarget[] = linkTargets.filter(
  link => link.href === placeholderHref
)

const deployedOrigins = {
  production: 'https://zenbujapanese.com',
  staging: 'https://staging.zenbujapanese.com'
} as const

export const productionOrigin = deployedOrigins.production
export const stagingOrigin = deployedOrigins.staging

export function isProductionSite() {
  return process.env.SITE_ENV === 'production'
}

export function isDeployedSite() {
  return process.env.SITE_ENV === 'staging' || process.env.SITE_ENV === 'production'
}

export function siteOrigin(): string {
  return process.env.SITE_ENV === 'staging' ? stagingOrigin : productionOrigin
}

export function servedOrigin(request: Request) {
  return isDeployedSite() ? siteOrigin() : new URL(request.url).origin
}

export function absoluteUrl(path: string, origin = siteOrigin()) {
  return path === '/' ? origin : new URL(path, origin).toString()
}
