import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import { appStoreRelease } from '@/lib/app-store'
import { iphoneAppPage } from '@/lib/products/zenbu-japanese-for-iphone'
import { ProductFacts } from './product-facts'

afterEach(() => {
  vi.restoreAllMocks()
})

async function factsWhenApple(answers: (request: Request) => Promise<Response>) {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const release = await appStoreRelease(answers)
  const html = renderToStaticMarkup(<ProductFacts {...iphoneAppPage.facts} release={release} />)
  return [...html.matchAll(/<dt[^>]*>([^<]+)<\/dt><dd[^>]*>([^<]+)<\/dd>/g)].map(
    ([, term, detail]) => [term, detail]
  )
}

test('the facts row adds the version and minimum iOS that Apple’s lookup gives', async () => {
  const lookup = { resultCount: 1, results: [{ version: '1.0.1', minimumOsVersion: '26.0' }] }
  expect(await factsWhenApple(async () => Response.json(lookup))).toEqual([
    ['Platform', 'iPhone'],
    ['Requires', 'iOS 26.0 or later'],
    ['Version', '1.0.1']
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
