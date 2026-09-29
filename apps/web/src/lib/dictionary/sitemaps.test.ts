import { afterEach, describe, expect, test, vi } from 'vitest'
import { loadedDictionary } from './data'
import {
  dictionarySitemapPaths,
  kanjiSitemapResponse,
  kanjiUrl,
  wordSitemapResponse,
  wordUrl
} from './sitemaps'

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: async () => ({ ctx: {} }) }))
vi.mock('./data', () => ({ loadedDictionary: vi.fn() }))

/** A dictionary database with `count` words numbered from 1, in sitemaps of `perSitemap`. */
function fakeDictionary(count: number, perSitemap: number) {
  const entSeqs = Array.from({ length: count }, (_, index) => index + 1)
  const sitemaps: { number: number; firstEntSeq: number; lastEntSeq: number }[] = []
  for (let start = 0; start < count; start += perSitemap) {
    const chunk = entSeqs.slice(start, start + perSitemap)
    sitemaps.push({
      number: sitemaps.length + 1,
      firstEntSeq: chunk[0],
      lastEntSeq: chunk.at(-1) ?? 0
    })
  }
  const sitemapWords = vi.fn(
    async (range: { firstEntSeq: number; lastEntSeq: number }, after: number, limit: number) =>
      entSeqs
        .filter(
          entSeq => entSeq > after && entSeq >= range.firstEntSeq && entSeq <= range.lastEntSeq
        )
        .slice(0, limit)
        .map(entSeq => ({ entSeq, slug: entSeq === 1 ? '見る' : `w&${entSeq}` }))
  )
  return {
    db: {
      wordSitemaps: async () => sitemaps,
      sitemapWords,
      // 㐂 has no meanings or readings, so the database leaves it out.
      indexableKanji: async () => ['見', '廊', '𠀋']
    },
    build: 'abc123'
  }
}

const request = (path: string) => new Request(`https://staging.zenbujapanese.com${path}`)
const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])

afterEach(() => {
  vi.clearAllMocks()
})

describe('without a loaded dictionary (local fixtures)', () => {
  test('there are no dictionary sitemaps', async () => {
    vi.mocked(loadedDictionary).mockResolvedValue(null)
    expect(await dictionarySitemapPaths()).toEqual([])
    expect(await wordSitemapResponse(request('/sitemaps/dictionary/1.xml'), 1)).toBeNull()
    expect(await kanjiSitemapResponse(request('/sitemaps/kanji.xml'))).toBeNull()
  })
})

describe('with a loaded dictionary', () => {
  test('the index lists every word sitemap, then the kanji sitemap', async () => {
    vi.mocked(loadedDictionary).mockResolvedValue(fakeDictionary(5, 2) as never)
    expect(await dictionarySitemapPaths()).toEqual([
      '/sitemaps/dictionary/1.xml',
      '/sitemaps/dictionary/2.xml',
      '/sitemaps/dictionary/3.xml',
      '/sitemaps/kanji.xml'
    ])
  })

  test('a word sitemap streams its range of canonical, percent-encoded, escaped URLs', async () => {
    const dictionary = fakeDictionary(25_000, 20_000)
    vi.mocked(loadedDictionary).mockResolvedValue(dictionary as never)
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
    // Two queries of 10,000, then one that finds nothing more.
    expect(dictionary.db.sitemapWords).toHaveBeenCalledTimes(3)

    const second = await wordSitemapResponse(request('/sitemaps/dictionary/2.xml'), 2)
    expect(locs((await second?.text()) ?? '')).toHaveLength(5_000)
    expect(await wordSitemapResponse(request('/sitemaps/dictionary/3.xml'), 3)).toBeNull()
  })

  test('the kanji sitemap lists the indexable kanji exactly, never normalized', async () => {
    vi.mocked(loadedDictionary).mockResolvedValue(fakeDictionary(1, 1) as never)
    const response = await kanjiSitemapResponse(request('/sitemaps/kanji.xml'))
    expect(locs((await response?.text()) ?? '')).toEqual([
      'https://zenbujapanese.com/dictionary/kanji/%E8%A6%8B/',
      'https://zenbujapanese.com/dictionary/kanji/%EF%A4%A8/',
      'https://zenbujapanese.com/dictionary/kanji/%F0%A0%80%8B/'
    ])
  })
})

test('canonical URLs match the pages', () => {
  expect(wordUrl(1259290, '見る')).toBe(
    'https://zenbujapanese.com/dictionary/%E8%A6%8B%E3%82%8B-1259290/'
  )
  expect(kanjiUrl('廊')).toBe('https://zenbujapanese.com/dictionary/kanji/%E5%BB%8A/')
})
