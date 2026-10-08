import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { sitemapIndexResponse } from '../sitemap-index'
import { dictionaryService } from './data'
import { type BrowseSitemapGroup, browseSitemapGroups } from './sitemap-files'
import {
  browseSitemapResponse,
  dictionarySitemapPaths,
  wordSitemapResponse,
  wordUrl
} from './sitemaps'

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: async () => ({ ctx: {} }) }))
vi.mock('./data', () => ({ dictionaryService: vi.fn() }))

function fakeService(count: number, perSitemap: number) {
  const build = 'abc123'
  const entSeqs = Array.from({ length: count }, (_, index) => index + 1)
  const sitemaps: { number: number; firstEntSeq: number; lastEntSeq: number; urlCount: number }[] =
    []
  for (let start = 0; start < count; start += perSitemap) {
    const chunk = entSeqs.slice(start, start + perSitemap)
    sitemaps.push({
      number: sitemaps.length + 1,
      firstEntSeq: chunk[0],
      lastEntSeq: chunk.at(-1) ?? 0,
      urlCount: chunk.length
    })
  }
  const sitemapWords = vi.fn(async (number: number, after: number, limit: number) => {
    const range = sitemaps.find(sitemap => sitemap.number === number)
    if (!range) return null
    const data = entSeqs
      .filter(entSeq => entSeq > after && entSeq >= range.firstEntSeq && entSeq <= range.lastEntSeq)
      .slice(0, limit)
      .map(entSeq => ({ entSeq, slug: entSeq === 1 ? '見る' : `w&${entSeq}` }))
    return { data, build }
  })
  const browse = vi.fn(async ({ path }: { path: string }) =>
    path === '/v1/sitemaps/browse'
      ? {
          data: {
            kana: [
              {
                initial: 'か',
                count: 10_389,
                prefixes: [
                  { kana: 'かが', count: 201 },
                  { kana: 'かカ', count: 1 }
                ]
              },
              { initial: 'カ', count: 3_000, prefixes: [] },
              { initial: 'ﾀ', count: 1, prefixes: [] }
            ],
            categories: [
              { slug: 'onomatopoeia', count: 1_338 },
              { slug: 'paleontology', count: 1 }
            ],
            rankedLists: [{ slug: 'anime', bands: [656, 784, 0, 0, 0, 0, 0, 0, 0, 9] }],
            jlptLists: [{ slug: 'jlpt-n5', count: 667 }],
            kanjiLists: [
              { slug: 'grade-1', count: 80 },
              { slug: 'strokes-29', count: 1 }
            ]
          },
          build
        }
      : null
  )
  return {
    wordSitemaps: async () => ({ data: sitemaps, build }),
    sitemapWords,
    browse
  }
}

const local = 'http://localhost:3100'
const request = (path: string, origin = local) => new Request(`${origin}${path}`)
const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])

beforeEach(() => {
  vi.stubEnv('SITE_ENV', '')
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('without a dictionary service (local fixtures)', () => {
  test('there are no dictionary sitemaps', async () => {
    vi.mocked(dictionaryService).mockResolvedValue(null)
    expect(await dictionarySitemapPaths()).toEqual([])
    expect(await wordSitemapResponse(request('/sitemaps/dictionary/1.xml'), 1)).toBeNull()
    expect(await browseSitemapResponse(request('/sitemap-kana.xml'), 'kana')).toBeNull()
    const index = await sitemapIndexResponse(request('/sitemap-index.xml'))
    expect(locs(await index.text())).toEqual([`${local}/sitemap-pages.xml`])
  })
})

const browseGroupFiles = [
  '/sitemap-kana.xml',
  '/sitemap-categories.xml',
  '/sitemap-frequency-lists.xml',
  '/sitemap-kanji-lists.xml'
]

const site = `${local}/dictionary/browse`

const browsePagesByGroup: Record<BrowseSitemapGroup, RegExp> = {
  kana: new RegExp(`^${site}/(kana|hiragana|katakana)/([^/]+/)?(\\d+/)?$`),
  categories: new RegExp(
    `^${site}/(?!kana/|hiragana/|katakana/|kanji/|frequency-dictionaries/)[a-z-]+/(\\d+/)?$`
  ),
  'frequency-lists': new RegExp(`^${site}/frequency-dictionaries/(.+/)?$`),
  'kanji-lists': new RegExp(`^${site}/kanji/([^/]+/)?$`)
}

async function browseUrls(group: string) {
  const response = await browseSitemapResponse(request(`/sitemap-${group}.xml`), group)
  return locs((await response?.text()) ?? '')
}

describe('with a dictionary service', () => {
  test('the index lists every word sitemap and each browse sitemap, and nothing else', async () => {
    vi.mocked(dictionaryService).mockResolvedValue(fakeService(5, 2) as never)
    expect(await dictionarySitemapPaths()).toEqual([
      '/sitemap-words.xml',
      '/sitemap-words-2.xml',
      '/sitemap-words-3.xml',
      ...browseGroupFiles
    ])
  })

  test.each([
    [
      'staging',
      'https://zenbujapanese-web-staging.example.workers.dev',
      'https://staging.zenbujapanese.com'
    ],
    ['production', 'https://zenbujapanese.com', 'https://zenbujapanese.com'],
    ['', local, local]
  ])('with SITE_ENV=%j, a request to %s lists sitemaps on %s', async (env, origin, listed) => {
    vi.stubEnv('SITE_ENV', env)
    vi.mocked(dictionaryService).mockResolvedValue(fakeService(3, 2) as never)
    const index = await sitemapIndexResponse(request('/sitemap-index.xml', origin))
    expect(locs(await index.text())).toEqual([
      `${listed}/sitemap-pages.xml`,
      `${listed}/sitemap-words.xml`,
      `${listed}/sitemap-words-2.xml`,
      ...browseGroupFiles.map(path => `${listed}${path}`)
    ])
    const words = await wordSitemapResponse(request('/sitemaps/dictionary/1.xml', origin), 1)
    expect(locs((await words?.text()) ?? '')[0]).toBe(`${listed}/dictionary/%E8%A6%8B%E3%82%8B-1/`)
    const kanji = await browseSitemapResponse(
      request('/sitemap-kanji-lists.xml', origin),
      'kanji-lists'
    )
    expect(locs((await kanji?.text()) ?? '')).toEqual([
      `${listed}/dictionary/browse/kanji/`,
      `${listed}/dictionary/browse/kanji/grade-1/`
    ])
  })

  test.each(
    browseSitemapGroups.map(group => [group])
  )('the %s sitemap lists only its own kind of browse page', async group => {
    vi.mocked(dictionaryService).mockResolvedValue(fakeService(5, 2) as never)
    const urls = await browseUrls(group)
    expect(urls.length).toBeGreaterThan(0)
    expect(urls.filter(url => !browsePagesByGroup[group].test(url))).toEqual([])
  })

  test('an unknown browse sitemap is not there', async () => {
    vi.mocked(dictionaryService).mockResolvedValue(fakeService(5, 2) as never)
    expect(await browseSitemapResponse(request('/sitemap-browse.xml'), 'browse')).toBeNull()
  })

  test('the browse sitemaps list every browse page with 10 words or more, each once', async () => {
    vi.mocked(dictionaryService).mockResolvedValue(fakeService(5, 2) as never)
    const urls = (await Promise.all(browseSitemapGroups.map(browseUrls))).flat()
    expect(urls).toEqual(
      expect.arrayContaining([
        `${site}/kana/`,
        `${site}/hiragana/`,
        `${site}/katakana/`,
        `${site}/kanji/`,
        `${site}/frequency-dictionaries/`,
        `${site}/parts-of-speech/`,
        `${site}/usage/`,
        `${site}/subjects/`,
        `${site}/hiragana/%E3%81%8B/`,
        `${site}/hiragana/%E3%81%8B%E3%81%8C/`,
        `${site}/hiragana/%E3%81%8B%E3%81%8C/2/`,
        `${site}/katakana/%E3%82%AB/`,
        `${site}/onomatopoeia/`,
        `${site}/onomatopoeia/7/`,
        `${site}/frequency-dictionaries/anime/1-1000/`,
        `${site}/frequency-dictionaries/anime/1001-2000/`,
        `${site}/frequency-dictionaries/jlpt/n5/`,
        `${site}/frequency-dictionaries/jlpt/n5/4/`,
        `${site}/kanji/grade-1/`
      ])
    )
    expect(urls).toHaveLength(26)
    expect(new Set(urls).size).toBe(urls.length)
    for (const thin of [
      'kana-order',
      '%E3%81%8B%E3%82%AB',
      '%EF%BE%80',
      'paleontology',
      '9001-10000',
      'strokes-29'
    ]) {
      expect(
        urls.filter(url => url.includes(thin)),
        thin
      ).toEqual([])
    }
  })

  test('a word sitemap streams its range of canonical, percent-encoded, escaped URLs', async () => {
    const service = fakeService(25_000, 20_000)
    vi.mocked(dictionaryService).mockResolvedValue(service as never)
    const response = await wordSitemapResponse(request('/sitemaps/dictionary/1.xml'), 1)
    expect(response?.headers.get('Content-Type')).toBe('application/xml; charset=utf-8')
    const xml = (await response?.text()) ?? ''
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><urlset')).toBe(true)
    expect(xml.endsWith('</urlset>')).toBe(true)
    const urls = locs(xml)
    expect(urls).toHaveLength(20_000)
    expect(urls[0]).toBe(`${local}/dictionary/%E8%A6%8B%E3%82%8B-1/`)
    expect(urls[1]).toBe(`${local}/dictionary/w&amp;2-2/`)
    expect(urls.at(-1)).toBe(`${local}/dictionary/w&amp;20000-20000/`)
    expect(service.sitemapWords).toHaveBeenCalledTimes(3)
    expect(service.sitemapWords).toHaveBeenNthCalledWith(2, 1, 10_000, 10_000)

    const second = await wordSitemapResponse(request('/sitemaps/dictionary/2.xml'), 2)
    expect(locs((await second?.text()) ?? '')).toHaveLength(5_000)
    expect(await wordSitemapResponse(request('/sitemaps/dictionary/3.xml'), 3)).toBeNull()
  })
})

test('canonical URLs match the pages', () => {
  expect(wordUrl(1259290, '見る')).toBe(
    'https://zenbujapanese.com/dictionary/%E8%A6%8B%E3%82%8B-1259290/'
  )
})
