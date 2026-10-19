import { afterEach, describe, expect, test, vi } from 'vitest'
import { sitemapIndexResponse } from '../sitemap-index'
import { type BrowseSitemapGroup, browseSitemapGroups } from './sitemap-files'
import {
  dictionarySitemaps,
  type SitemapFile,
  type SitemapSource,
  wordsPerSitemap,
  wordUrl
} from './sitemaps'

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
  const browseSitemap = vi.fn(async () => ({
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
  }))
  return {
    wordSitemaps: async () => ({ data: sitemaps, build }),
    sitemapWords,
    browseSitemap
  }
}

const local = 'http://localhost:3100'
const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])

async function text(file: SitemapFile | undefined) {
  let xml = ''
  for await (const chunk of file?.xml() ?? []) xml += chunk
  return xml
}

async function written(service: SitemapSource = fakeService(5, 2), origin = local) {
  return dictionarySitemaps(service, origin)
}

async function urls(path: string, service: SitemapSource = fakeService(5, 2), origin = local) {
  const files = await written(service, origin)
  return locs(await text(files.find(file => file.path === path)))
}

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

const browseGroupFiles = [
  '/sitemap-kana.xml',
  '/sitemap-categories.xml',
  '/sitemap-frequency-lists.xml',
  '/sitemap-kanji-lists.xml'
]

const site = `${local}/dictionary/browse`
const inEitherLanguage = `${local}(?:/ja)?/dictionary/browse`

const browsePagesByGroup: Record<BrowseSitemapGroup, RegExp> = {
  kana: new RegExp(`^${inEitherLanguage}/(kana|hiragana|katakana)/([^/]+/)?(\\d+/)?$`),
  categories: new RegExp(
    `^${inEitherLanguage}/(?!kana/|hiragana/|katakana/|kanji/|frequency-dictionaries/)[a-z-]+/(\\d+/)?$`
  ),
  'frequency-lists': new RegExp(`^${inEitherLanguage}/frequency-dictionaries/(.+/)?$`),
  'kanji-lists': new RegExp(`^${inEitherLanguage}/kanji/([^/]+/)?$`)
}

const browseUrls = (group: BrowseSitemapGroup) => urls(`/sitemap-${group}.xml`)

describe('the sitemap index', () => {
  test.each([
    [
      'staging',
      'https://zenbujapanese-web-staging.example.workers.dev',
      'https://staging.zenbujapanese.com'
    ],
    ['production', 'https://zenbujapanese.com', 'https://zenbujapanese.com'],
    ['', local, local]
  ])('with SITE_ENV=%j, a request to %s lists the written sitemaps on %s', async (env, origin, listed) => {
    vi.stubEnv('SITE_ENV', env)
    vi.stubEnv(
      'ZENBU_DICTIONARY_SITEMAPS',
      '/sitemap-words.xml /sitemap-words-2.xml /sitemap-kana.xml'
    )
    const index = sitemapIndexResponse(new Request(`${origin}/sitemap-index.xml`))
    expect(locs(await index.text())).toEqual([
      `${listed}/sitemap-pages.xml`,
      `${listed}/sitemap-tools.xml`,
      `${listed}/sitemap-words.xml`,
      `${listed}/sitemap-words-2.xml`,
      `${listed}/sitemap-kana.xml`
    ])
  })

  test('without written dictionary sitemaps, as in local runs, lists the pages and tools', async () => {
    vi.stubEnv('SITE_ENV', '')
    vi.stubEnv('ZENBU_DICTIONARY_SITEMAPS', '')
    const index = sitemapIndexResponse(new Request(`${local}/sitemap-index.xml`))
    expect(locs(await index.text())).toEqual([
      `${local}/sitemap-pages.xml`,
      `${local}/sitemap-tools.xml`
    ])
  })
})

describe('the dictionary sitemaps a deploy writes', () => {
  test('are every word sitemap, then each browse sitemap, and nothing else', async () => {
    const files = await written()
    expect(files.map(file => file.path)).toEqual([
      '/sitemap-words.xml',
      '/sitemap-words-2.xml',
      '/sitemap-words-3.xml',
      ...browseGroupFiles
    ])
    expect(files.map(file => file.urls)).toEqual([4, 4, 2, 14, 20, 26, 4])
  })

  test('list URLs on the origin they are given', async () => {
    const origin = 'https://staging.zenbujapanese.com'
    const service = fakeService(3, 2)
    expect((await urls('/sitemap-words.xml', service, origin))[0]).toBe(
      `${origin}/dictionary/%E8%A6%8B%E3%82%8B-1/`
    )
    expect(await urls('/sitemap-kanji-lists.xml', service, origin)).toEqual([
      `${origin}/dictionary/browse/kanji/`,
      `${origin}/ja/dictionary/browse/kanji/`,
      `${origin}/dictionary/browse/kanji/grade-1/`,
      `${origin}/ja/dictionary/browse/kanji/grade-1/`
    ])
  })

  test.each(
    browseSitemapGroups.map(group => [group])
  )('the %s sitemap lists only its own kind of browse page', async group => {
    const listed = await browseUrls(group)
    expect(listed.length).toBeGreaterThan(0)
    expect(listed.filter(url => !browsePagesByGroup[group].test(url))).toEqual([])
  })

  test('the browse sitemaps list every browse page with 10 words or more, each once in each language', async () => {
    const listed = (await Promise.all(browseSitemapGroups.map(browseUrls))).flat()
    expect(listed).toEqual(
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
        `${site}/frequency-dictionaries/anime/1-1000/2/`,
        `${site}/frequency-dictionaries/anime/1001-2000/`,
        `${site}/frequency-dictionaries/anime/1001-2000/4/`,
        `${site}/frequency-dictionaries/jlpt/n5/`,
        `${site}/frequency-dictionaries/jlpt/n5/4/`,
        `${site}/kanji/grade-1/`
      ])
    )
    expect(listed).toHaveLength(64)
    expect(listed.filter(url => url.startsWith(`${local}/ja/`))).toEqual(
      listed
        .filter(url => !url.startsWith(`${local}/ja/`))
        .map(url => url.replace(local, `${local}/ja`))
    )
    expect(new Set(listed).size).toBe(listed.length)
    for (const thin of [
      'kana-order',
      '%E3%81%8B%E3%82%AB',
      '%EF%BE%80',
      'paleontology',
      '9001-10000',
      '-1000/1/',
      '-2000/5/',
      'strokes-29'
    ]) {
      expect(
        listed.filter(url => url.includes(thin)),
        thin
      ).toEqual([])
    }
  })

  test('a band of 10 words or more is listed as its pages of 200 words, its first as the band’s URL', async () => {
    const bands = (await browseUrls('frequency-lists')).filter(url =>
      url.startsWith(`${site}/frequency-dictionaries/anime/`)
    )
    const pagesOf = (band: string) =>
      ['', '2/', '3/', '4/'].map(page => `${site}/frequency-dictionaries/anime/${band}/${page}`)
    expect(bands).toEqual([...pagesOf('1-1000'), ...pagesOf('1001-2000')])
  })

  test('a word sitemap writes its range of canonical, percent-encoded, escaped URLs, each word in English and Japanese', async () => {
    const service = fakeService(25_000, 20_000)
    const files = await written(service)
    const xml = await text(files[0])
    expect(
      xml.startsWith(
        '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'
      )
    ).toBe(true)
    expect(xml.endsWith('</urlset>')).toBe(true)
    const listed = locs(xml)
    expect(listed).toHaveLength(40_000)
    expect(listed.slice(0, 3)).toEqual([
      `${local}/dictionary/%E8%A6%8B%E3%82%8B-1/`,
      `${local}/ja/dictionary/%E8%A6%8B%E3%82%8B-1/`,
      `${local}/dictionary/w&amp;2-2/`
    ])
    expect(listed.at(-1)).toBe(`${local}/ja/dictionary/w&amp;20000-20000/`)
    expect(xml).toContain(
      `<url><loc>${local}/dictionary/%E8%A6%8B%E3%82%8B-1/</loc><xhtml:link rel="alternate" hreflang="en" href="${local}/dictionary/%E8%A6%8B%E3%82%8B-1/"/><xhtml:link rel="alternate" hreflang="ja" href="${local}/ja/dictionary/%E8%A6%8B%E3%82%8B-1/"/><xhtml:link rel="alternate" hreflang="x-default" href="${local}/dictionary/%E8%A6%8B%E3%82%8B-1/"/></url>`
    )
    expect(service.sitemapWords).toHaveBeenCalledTimes(3)
    expect(service.sitemapWords).toHaveBeenNthCalledWith(2, 1, 10_000, 10_000)
    expect(locs(await text(files[1]))).toHaveLength(10_000)
  })

  test('a service sitemap of more than 20,000 words takes two files, so each stays under 50,000 URLs and a Workers asset’s 25 MiB', async () => {
    expect(wordsPerSitemap).toBe(20_000)
    const files = await written(fakeService(30_000, 30_000))
    expect(files.map(file => [file.path, file.urls]).slice(0, 2)).toEqual([
      ['/sitemap-words.xml', 40_000],
      ['/sitemap-words-2.xml', 20_000]
    ])
    const first = locs(await text(files[0]))
    const second = locs(await text(files[1]))
    expect(first).toHaveLength(40_000)
    expect(first.at(-1)).toBe(`${local}/ja/dictionary/w&amp;20000-20000/`)
    expect(second).toHaveLength(20_000)
    expect(second[0]).toBe(`${local}/dictionary/w&amp;20001-20001/`)
  })

  test('fail, rather than write less, when the service is missing a sitemap', async () => {
    await expect(
      written({ ...fakeService(5, 2), wordSitemaps: async () => ({ data: [] }) })
    ).rejects.toThrow('lists no word sitemaps')
    await expect(
      written({ ...fakeService(5, 2), browseSitemap: async () => null })
    ).rejects.toThrow('has no browse sitemap')
    const files = await written({ ...fakeService(5, 2), sitemapWords: async () => null })
    await expect(text(files[0])).rejects.toThrow('has no word sitemap 1')
  })

  test('fail when a word sitemap holds fewer words than the service listed for it', async () => {
    const service = fakeService(5, 2)
    const short: SitemapSource = {
      ...service,
      sitemapWords: async (number, after) =>
        after === 0 ? service.sitemapWords(number, after, 1) : { data: [] }
    }
    const files = await written(short)
    await expect(text(files[0])).rejects.toThrow(
      'Word sitemap 1 has 1 words; the dictionary service listed 2'
    )
  })
})

test('canonical URLs match the pages', () => {
  expect(wordUrl(1259290, '見る')).toBe(
    'https://zenbujapanese.com/dictionary/%E8%A6%8B%E3%82%8B-1259290/'
  )
})
