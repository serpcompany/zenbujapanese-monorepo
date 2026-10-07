import { expect, test } from './test'

const browse = (path = '') => `/dictionary/browse/${path}`

const pagesOnTheFixtures = [
  '/dictionary/',
  '/sitemap/',
  browse(),
  browse('kana/'),
  browse('hiragana/'),
  browse('katakana/'),
  browse(`hiragana/${encodeURIComponent('い')}/`),
  browse(`hiragana/${encodeURIComponent('いる')}/`),
  browse('parts-of-speech/'),
  browse('usage/'),
  browse('subjects/'),
  browse('ichidan-verbs/'),
  browse('ichidan-verbs/2/'),
  browse('ichidan-verbs/kana-order/'),
  browse('audiovisual/'),
  browse('frequency-dictionaries/'),
  browse('frequency-dictionaries/youtube/1-1000/'),
  browse('frequency-dictionaries/anime/1-1000/'),
  browse('frequency-dictionaries/jlpt/n5/'),
  browse('kanji/'),
  browse('kanji/grade-4/'),
  browse('kanji/jlpt-n5/'),
  browse('kanji/jinmeiyo/')
]

const requestsAtOnce = 16
const crawlTimeout = 1_200_000

test.describe('browse links', () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'A page links the same URLs at every width')
  })

  test('no link on a browse page leads to a redirect, as a site audit would flag', async ({
    page,
    request
  }) => {
    test.setTimeout(crawlTimeout)
    const linkedFrom = new Map<string, string>()
    for (const path of pagesOnTheFixtures) {
      expect((await page.goto(path))?.status(), path).toBe(200)
      const hrefs = await page
        .locator('a[href^="/"]')
        .evaluateAll(anchors => anchors.map(anchor => anchor.getAttribute('href') ?? ''))
      for (const href of hrefs) {
        const [target] = href.split('#')
        if (target && !linkedFrom.has(target)) linkedFrom.set(target, path)
      }
    }
    const waiting = [...linkedFrom]
    const redirects: string[] = []
    await Promise.all(
      Array.from({ length: requestsAtOnce }, async () => {
        for (let next = waiting.shift(); next; next = waiting.shift()) {
          const [href, from] = next
          const response = await request.get(href, { maxRedirects: 0 })
          if (response.status() >= 300 && response.status() < 400) {
            redirects.push(
              `${href}, linked from ${from}, redirects to ${response.headers().location}`
            )
          }
        }
      })
    )
    expect(redirects).toEqual([])
    expect(linkedFrom.size).toBeGreaterThan(3_000)
  })
})
