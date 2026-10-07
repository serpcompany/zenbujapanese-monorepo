import { afterEach, describe, expect, test, vi } from 'vitest'
import { dictionaryService } from './data'
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
              { initial: 'か', prefixes: [{ prefix: 'かが', pages: 2 }] },
              { initial: 'カ', prefixes: [] }
            ],
            categories: [{ slug: 'onomatopoeia', pages: 1 }],
            rankedLists: [{ slug: 'anime', pages: 2 }],
            kanjiLists: ['grade-1']
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

const request = (path: string) => new Request(`https://staging.zenbujapanese.com${path}`)
const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])

afterEach(() => {
  vi.clearAllMocks()
})

describe('without a dictionary service (local fixtures)', () => {
  test('there are no dictionary sitemaps', async () => {
    vi.mocked(dictionaryService).mockResolvedValue(null)
    expect(await dictionarySitemapPaths()).toEqual([])
    expect(await wordSitemapResponse(request('/sitemaps/dictionary/1.xml'), 1)).toBeNull()
    expect(await browseSitemapResponse(request('/sitemaps/browse.xml'))).toBeNull()
  })
})

describe('with a dictionary service', () => {
  test('the index lists every word sitemap and the browse sitemap, and nothing else', async () => {
    vi.mocked(dictionaryService).mockResolvedValue(fakeService(5, 2) as never)
    expect(await dictionarySitemapPaths()).toEqual([
      '/sitemaps/dictionary/1.xml',
      '/sitemaps/dictionary/2.xml',
      '/sitemaps/dictionary/3.xml',
      '/sitemaps/browse.xml'
    ])
  })

  test('the browse sitemap lists every browse page', async () => {
    vi.mocked(dictionaryService).mockResolvedValue(fakeService(5, 2) as never)
    const response = await browseSitemapResponse(request('/sitemaps/browse.xml'))
    const urls = locs((await response?.text()) ?? '')
    const site = 'https://zenbujapanese.com/dictionary/browse'
    expect(urls).toEqual(
      expect.arrayContaining([
        `${site}/`,
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
        `${site}/frequency-dictionaries/anime/`,
        `${site}/frequency-dictionaries/anime/2/`,
        `${site}/kanji/grade-1/`
      ])
    )
    expect(urls).toHaveLength(17)
    expect(urls.filter(url => url.includes('kana-order'))).toEqual([])
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
    expect(urls[0]).toBe('https://zenbujapanese.com/dictionary/%E8%A6%8B%E3%82%8B-1/')
    expect(urls[1]).toBe('https://zenbujapanese.com/dictionary/w&amp;2-2/')
    expect(urls.at(-1)).toBe('https://zenbujapanese.com/dictionary/w&amp;20000-20000/')
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
