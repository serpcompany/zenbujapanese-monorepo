import { type AppScreenshot, appScreenshotsIn } from '@/lib/app-screenshots'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'
import { localizedPath } from '@/lib/i18n/paths'
import {
  featuredApp,
  livePage,
  type ProductFilter,
  type ProductId,
  type ProductMark,
  type ProductSymbol,
  type ProductType,
  productFactSymbols,
  productFilters,
  products
} from '@/lib/products/catalog'
import { type LinkTo, localizedLink, site } from '@/lib/site'

export interface CatalogFilter {
  id: ProductFilter
  label: string
  title: string
  description: string
}

export interface CatalogProduct {
  id: ProductId
  type: ProductType
  title: string
  description: string
  mark: ProductMark
  facts: readonly { symbol: ProductSymbol; text: string }[]
  href?: string
  badge: string
  typeLabel: string
  searchText: string
}

export interface CatalogApp {
  type: ProductType
  title: string
  description: string
  tags: readonly string[]
  includes: readonly string[]
  icon: string
  page: LinkTo
  screenshots: readonly AppScreenshot[]
  searchText: string
}

export interface Catalog {
  filters: readonly CatalogFilter[]
  featuredApp: CatalogApp
  products: readonly CatalogProduct[]
}

const searchText = (...parts: readonly string[]) => parts.join(' ').toLowerCase()

export const productNameIn = (id: ProductId, locale: Locale) =>
  fill(getDictionary(locale).products.items[id].title, { name: site.name })

export function catalogIn(locale: Locale): Catalog {
  const t = getDictionary(locale)
  const text = t.products
  const typeLabel = (type: ProductType) => text.filters[type].label
  const shots = appScreenshotsIn(locale)
  const app = {
    type: featuredApp.type,
    title: text.featuredApp.title,
    description: text.featuredApp.description,
    tags: featuredApp.tags.map(tag => text.featuredApp.tags[tag]),
    includes: featuredApp.includes.map(item => text.featuredApp.includes[item]),
    icon: featuredApp.icon,
    page: localizedLink(featuredApp.page, locale),
    screenshots: featuredApp.screenshots.map(key => shots[key])
  }
  return {
    filters: productFilters.map(id => ({ id, ...text.filters[id] })),
    featuredApp: {
      ...app,
      searchText: searchText(
        app.title,
        app.description,
        ...app.tags,
        ...app.includes,
        typeLabel(app.type)
      )
    },
    products: products.map(({ page, ...product }) => {
      const href = livePage(page)?.href
      const filled = productNameIn(product.id, locale)
      const { description } = text.items[product.id]
      return {
        ...product,
        title: filled,
        description,
        facts: product.facts.map(fact => ({
          symbol: productFactSymbols[fact],
          text: text.facts[fact]
        })),
        ...(href ? { href: localizedPath(href, locale) } : {}),
        badge: href ? text.badges.free : text.badges.comingSoon,
        typeLabel: typeLabel(product.type),
        searchText: searchText(filled, description, typeLabel(product.type))
      }
    })
  }
}

export function productIn(catalog: Catalog, id: ProductId): CatalogProduct {
  const product = catalog.products.find(candidate => candidate.id === id)
  if (!product) throw new Error(`Unknown product: ${id}`)
  return product
}
