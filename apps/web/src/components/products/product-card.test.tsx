import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { catalogIn, productIn } from '@/lib/products/localized-catalog'
import { FeaturedAppCard } from './featured-app-card'
import { ProductCard } from './product-card'

const cards = (locale: Locale) => {
  const catalog = catalogIn(locale)
  const t = getDictionary(locale)
  return renderToStaticMarkup(
    <>
      <FeaturedAppCard
        app={catalog.featuredApp}
        locale={locale}
        text={{ ...t.products.catalog, getTheApp: t.chrome.getTheApp }}
      />
      <ProductCard product={productIn(catalog, 'kana-charts')} />
      <ProductCard product={productIn(catalog, 'browser-extension')} />
    </>
  )
}

test('the English cards read as they always have', () => {
  const html = cards('en')
  expect(html).toContain('>Zenbu Japanese for iPhone</h3>')
  expect(html).toContain('Learn more<span class="sr-only"> about Zenbu Japanese for iPhone</span>')
  expect(html).toContain('href="/products/zenbu-japanese-app/"')
  expect(html).toContain('href="/dictionary/browse/kana/"')
  expect(html).toContain('>Free</span>')
  expect(html).toContain('>Coming soon</span>')
  expect(html).toContain('>Get the app<')
})

test('the Japanese cards are in Japanese and link to the Japanese pages', () => {
  const html = cards('ja')
  expect(html).toContain('>iPhone版 Zenbu Japanese</h3>')
  expect(html).toContain('<span class="sr-only">iPhone版 Zenbu Japaneseについて</span>詳しく見る')
  expect(html).toContain('href="/ja/products/zenbu-japanese-app/"')
  expect(html).toContain('href="/ja/dictionary/browse/kana/"')
  expect(html).toContain('>五十音表</h3>')
  expect(html).toContain('>無料</span>')
  expect(html).toContain('>近日公開</span>')
  expect(html).toContain('>アプリを入手<')
  expect(html).not.toMatch(/>(Free|Coming soon|Learn more|Get the app)</)
})
