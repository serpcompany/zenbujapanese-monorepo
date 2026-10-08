import { normalizeSearchQuery, searchPath } from '@/lib/dictionary/urls'
import { placeholderHref } from '@/lib/site'
import { drawerLinks, type MegaMenu, type SiteMenu, siteMenus } from '@/lib/site-menus'

export const homeTitle = 'Zenbu Japanese: Japanese Dictionary and Translator for iPhone'

const exampleSearch = (query: string, lang?: 'ja' | 'ja-Latn') => ({
  query,
  lang,
  path: searchPath(normalizeSearchQuery(query))
})

export const exampleSearches = [
  exampleSearch('大丈夫', 'ja'),
  exampleSearch('taberu', 'ja-Latn'),
  exampleSearch('峠', 'ja'),
  exampleSearch('to persevere')
]

const isToolsMenu = (menu: SiteMenu): menu is MegaMenu =>
  menu.kind === 'mega' && menu.label === 'Tools'

export const webTools = siteMenus
  .filter(isToolsMenu)
  .flatMap(menu => drawerLinks(menu))
  .filter(link => link.href !== placeholderHref)
