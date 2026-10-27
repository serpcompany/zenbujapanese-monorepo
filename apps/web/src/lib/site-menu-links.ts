import { withoutDefaultLocale } from '@/lib/i18n/routing'
import type { MegaMenu, MenuLink, SiteMenu } from '@/lib/site-menus'

const withSlash = (path: string) => (path.endsWith('/') ? path : `${path}/`)

const publicPath = (pathname: string) => withSlash(withoutDefaultLocale(pathname) ?? pathname)

export const drawerLinks = (menu: MegaMenu): MenuLink[] => [
  ...(menu.lead ? [menu.lead] : []),
  ...menu.columns.flatMap(column => column.links)
]

export function isCurrentSection(menu: SiteMenu, pathname: string): boolean {
  const path = publicPath(pathname)
  return menu.kind === 'mega'
    ? path.startsWith(menu.section)
    : menu.links.some(link => path.startsWith(link.href))
}

export const isCurrentPage = (href: string, pathname: string) => publicPath(pathname) === href
