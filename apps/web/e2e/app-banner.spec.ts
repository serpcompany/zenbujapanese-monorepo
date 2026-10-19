import { iosAppStoreId } from '../src/lib/app-links'
import { japanesePageTypes, pageTypes } from './page-types'
import { expect, test } from './test'

const bannerContents = (html: string) =>
  [...html.matchAll(/<meta\b[^>]*\bname="apple-itunes-app"[^>]*>/g)].map(
    ([tag]) => tag.match(/\bcontent="([^"]*)"/)?.[1]
  )

test.describe('the App Store banner', () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The head is the same at every width')
  })

  for (const { name, path } of [...pageTypes, ...japanesePageTypes]) {
    test(`${name} names the iPhone app once, for Safari's banner`, async ({ request }) => {
      const html = await (await request.get(path.replace(/#.*$/, ''))).text()
      expect(bannerContents(html)).toEqual([`app-id=${iosAppStoreId}`])
    })
  }
})
