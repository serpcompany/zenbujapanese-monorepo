import { accountPagesOpen } from './account/availability'
import { accountPages } from './account/pages'
import { iosAppStoreUrl } from './app-links'
import { productionOrigin, stagingOrigin } from './origins'
import { converterPath, toolsPath } from './tools/paths'

export const site = {
  name: 'Zenbu Japanese',
  mark: '全',
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
  { id: 'tools', kind: 'page', name: 'Tools index, /tools/', href: toolsPath },
  {
    id: 'hiragana-to-katakana',
    kind: 'page',
    name: 'Hiragana to Katakana converter',
    href: converterPath('hiragana-to-katakana')
  },
  {
    id: 'romaji-to-kana',
    kind: 'page',
    name: 'Romaji to Kana converter',
    href: converterPath('romaji-to-kana')
  },
  {
    id: 'kanji-to-furigana',
    kind: 'page',
    name: 'Kanji to Furigana converter',
    href: converterPath('kanji-to-furigana')
  },
  { id: 'products', kind: 'page', name: 'Products index', href: '/products/' },
  {
    id: 'iphone-app',
    kind: 'page',
    name: 'Zenbu Japanese for iPhone product page',
    href: '/products/zenbu-japanese-app/'
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
  { id: 'app-store', kind: 'store', name: 'App Store listing', href: iosAppStoreUrl },
  {
    id: 'youtube',
    kind: 'social',
    name: 'YouTube',
    href: 'https://www.youtube.com/@zenbu-japanese'
  },
  { id: 'github', kind: 'social', name: 'GitHub', href: 'https://github.com/zenbujapanese' },
  { id: 'x', kind: 'social', name: 'X', href: 'https://x.com/zenbujapanese' },
  {
    id: 'facebook',
    kind: 'social',
    name: 'Facebook',
    href: 'https://www.facebook.com/zenbujapanese/'
  },
  { id: 'reddit', kind: 'social', name: 'Reddit', href: 'https://www.reddit.com/r/ZenbuJapanese/' },
  {
    id: 'instagram',
    kind: 'social',
    name: 'Instagram',
    href: 'https://www.instagram.com/zenbu_japanese'
  },
  { id: 'tiktok', kind: 'social', name: 'TikTok', href: 'https://www.tiktok.com/@zenbujapanese' },
  {
    id: 'linkedin',
    kind: 'social',
    name: 'LinkedIn',
    href: 'https://www.linkedin.com/company/zenbujapanese'
  },
  { id: 'medium', kind: 'social', name: 'Medium', href: 'https://medium.com/@zenbujapanese' }
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

export function isProductionSite() {
  return process.env.SITE_ENV === 'production'
}

export function isStagingSite() {
  return process.env.SITE_ENV === 'staging'
}

export function isDeployedSite() {
  return isStagingSite() || isProductionSite()
}

export function siteOrigin(): string {
  return isStagingSite() ? stagingOrigin : productionOrigin
}

export function servedOrigin(request: Request) {
  return isDeployedSite() ? siteOrigin() : new URL(request.url).origin
}

export function absoluteUrl(path: string, origin = siteOrigin()) {
  return path === '/' ? origin : new URL(path, origin).toString()
}
