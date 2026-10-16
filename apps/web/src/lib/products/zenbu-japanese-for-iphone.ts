import { appScreenshotsIn } from '@/lib/app-screenshots'
import type { Locale } from '@/lib/i18n/config'
import { type Dictionary, getDictionary } from '@/lib/i18n/dictionary'
import { localizedPath } from '@/lib/i18n/paths'
import type { SitePath } from '@/lib/pages'
import { featuredApp, type ProductId } from '@/lib/products/catalog'
import { catalogIn, productIn } from '@/lib/products/localized-catalog'
import type {
  ProductDemo,
  ProductPageSymbol,
  ProductPoint,
  ProductQuestion
} from '@/lib/products/product-page'
import { site } from '@/lib/site'

type PageText = Dictionary['productPage']
type ScreenshotKey = keyof ReturnType<typeof appScreenshotsIn>

export const iphoneAppPath: Extract<SitePath, '/products/zenbu-japanese-app/'> =
  '/products/zenbu-japanese-app/'

const demos: readonly {
  id: keyof PageText['demos']
  symbol: ProductPageSymbol
  screenshot: ScreenshotKey
}[] = [
  { id: 'search', symbol: 'search', screenshot: 'searchResults' },
  { id: 'imageSearch', symbol: 'camera', screenshot: 'imageSearch' },
  { id: 'handwriting', symbol: 'pen', screenshot: 'handwriting' },
  { id: 'conjugations', symbol: 'book', screenshot: 'conjugations' },
  { id: 'translate', symbol: 'languages', screenshot: 'translate' }
]

const screenshots: readonly (keyof PageText['captions'] & ScreenshotKey)[] = [
  'searchResults',
  'wordDetail',
  'imageSearch',
  'handwriting',
  'kanjiDetail',
  'conjugations',
  'translate'
]

const features: readonly { id: keyof PageText['features']; symbol: ProductPageSymbol }[] = [
  { id: 'dictionary', symbol: 'book' },
  { id: 'imageSearch', symbol: 'camera' },
  { id: 'handwriting', symbol: 'pen' },
  { id: 'translate', symbol: 'languages' },
  { id: 'player', symbol: 'tv' },
  { id: 'lists', symbol: 'list' },
  { id: 'frequency', symbol: 'chart' },
  { id: 'furigana', symbol: 'type' }
]

const related: readonly ProductId[] = ['dictionary', 'browser-extension', 'kana-charts']

function questionsIn(t: PageText, locale: Locale): ProductQuestion[] {
  const { offline, frequency, web } = t.questions
  return [
    offline,
    frequency,
    { ...web, link: { title: web.link, href: localizedPath('/dictionary/', locale) } }
  ]
}

export function iphoneAppPageIn(locale: Locale) {
  const t = getDictionary(locale).productPage
  const catalog = catalogIn(locale)
  const shots = appScreenshotsIn(locale)
  return {
    path: iphoneAppPath,
    title: catalog.featuredApp.title,
    name: site.name,
    subtitle: t.subtitle,
    lead: t.lead,
    icon: featuredApp.icon,
    facts: { platform: 'iPhone' },
    demos: demos.map(
      (demo): ProductDemo => ({
        symbol: demo.symbol,
        ...t.demos[demo.id],
        screenshot: shots[demo.screenshot]
      })
    ),
    screenshots: screenshots.map(key => ({
      screenshot: shots[key],
      caption: t.captions[key]
    })),
    features: features.map(
      (feature): ProductPoint => ({ symbol: feature.symbol, ...t.features[feature.id] })
    ),
    questions: questionsIn(t, locale),
    related: related.map(id => productIn(catalog, id))
  }
}
