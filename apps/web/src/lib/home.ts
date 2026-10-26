import { normalizeQuery } from '@zenbu/dictionary-core/search/query'
import { searchPath } from '@/lib/dictionary/urls'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/paths'
import { placeholderHref } from '@/lib/site'
import { drawerLinks } from '@/lib/site-menu-links'
import { type MegaMenu, type SiteMenu, siteMenusIn } from '@/lib/site-menus'

const exampleQueries = [
  { query: '大丈夫', lang: 'ja' },
  { query: 'taberu', lang: 'ja-Latn' },
  { query: '峠', lang: 'ja' },
  { query: 'to persevere', lang: 'en' }
] as const

export function exampleSearchesIn(locale: Locale) {
  return exampleQueries.map(({ query, lang }) => ({
    query,
    lang: lang === locale ? undefined : lang,
    path: localizedPath(searchPath(normalizeQuery(query)), locale)
  }))
}

const isToolsMenu = (menu: SiteMenu): menu is MegaMenu =>
  menu.kind === 'mega' && menu.id === 'tools'

export function webToolsIn(locale: Locale) {
  return siteMenusIn(locale)
    .filter(isToolsMenu)
    .flatMap(menu => drawerLinks(menu))
    .filter(link => link.href !== placeholderHref)
}
