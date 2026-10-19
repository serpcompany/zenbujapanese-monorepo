import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import { appStoreRelease } from '@/lib/app-store'
import type { Locale } from '@/lib/i18n/config'
import { iphoneAppPageIn } from '@/lib/products/zenbu-japanese-for-iphone'
import { ProductFacts } from './product-facts'

afterEach(() => {
  vi.restoreAllMocks()
})

async function factsWhenApple(
  answers: (request: Request) => Promise<Response>,
  locale: Locale = 'en'
) {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const release = await appStoreRelease(answers)
  const html = renderToStaticMarkup(
    <ProductFacts {...iphoneAppPageIn(locale).facts} locale={locale} release={release} />
  )
  return [...html.matchAll(/<dt[^>]*>([^<]+)<\/dt><dd[^>]*>([^<]+)<\/dd>/g)].map(
    ([, term, detail]) => [term, detail]
  )
}

const lookup = { resultCount: 1, results: [{ version: '1.0.1', minimumOsVersion: '26.0' }] }

test('the facts row adds the version and minimum iOS that Apple’s lookup gives', async () => {
  expect(await factsWhenApple(async () => Response.json(lookup))).toEqual([
    ['Platform', 'iPhone'],
    ['Requires', 'iOS 26.0 or later'],
    ['Version', '1.0.1']
  ])
})

test('the Japanese facts row names each fact in Japanese', async () => {
  expect(await factsWhenApple(async () => Response.json(lookup), 'ja')).toEqual([
    ['対応機種', 'iPhone'],
    ['動作環境', 'iOS 26.0以降'],
    ['バージョン', '1.0.1']
  ])
})

test.each<[string, (request: Request) => Promise<Response>]>([
  [
    'Apple can’t be reached',
    async () => {
      throw new TypeError('fetch failed')
    }
  ],
  ['Apple returns nothing', async () => Response.json({ resultCount: 0, results: [] })]
])('the facts row leaves out the version and minimum iOS when %s', async (_, answers) => {
  expect(await factsWhenApple(answers)).toEqual([['Platform', 'iPhone']])
})
