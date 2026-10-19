import type { BrowseWordsResponse } from '@zenbu/dictionary-core/artifact/browse'
import { fixtureBrowseAnswers } from '@zenbu/dictionary-core/fixtures'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { dictionaryService } from '@/lib/dictionary/data'
import { pageProps } from '@/test/page-props'
import { redirectOf } from '@/test/redirect'
import LaterBandPage, { generateMetadata as laterPageMetadata } from './[list]/[band]/[page]/page'
import BandPage, { generateMetadata } from './[list]/[band]/page'

vi.mock('next/navigation', async original =>
  (await import('@/test/redirect')).redirectingNavigation(original)
)
vi.mock('@/lib/dictionary/data', async original => ({
  ...(await original<typeof import('@/lib/dictionary/data')>()),
  dictionaryService: vi.fn()
}))

const animePath = '/dictionary/browse/frequency-dictionaries/anime/'
const notFound = { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }

const animeFirstBand = fixtureBrowseAnswers['/v1/browse/ranked/anime?page=1'] as BrowseWordsResponse

const ranksOnBandTwo = [
  ...Array.from({ length: 12 }, (_, index) => 1_001 + index * 15),
  ...Array.from({ length: 5 }, (_, index) => 1_201 + index * 40),
  1_650,
  1_700,
  1_800
]

const bandTwo: BrowseWordsResponse = {
  ...animeFirstBand,
  page: 2,
  words: animeFirstBand.words.map((word, index) => ({ ...word, rank: ranksOnBandTwo[index] }))
}

function serveBandTwo() {
  vi.mocked(dictionaryService).mockResolvedValue({
    browse: async ({ path }: { path: string }) =>
      path === '/v1/browse/ranked/anime?page=2' ? { data: bandTwo } : null
  } as never)
}

const band = (segment: string, locale = 'en') => pageProps({ locale, list: 'anime', band: segment })
const bandPage = (segment: string, page: string, locale = 'en', list = 'anime') =>
  pageProps({ locale, list, band: segment, page })

const rendered = async (page: Promise<ReactNode>) => renderToStaticMarkup(await page)
const rows = (html: string) => html.match(/data-result-row=/g)?.length ?? 0
const lastCrumb = (html: string) => html.match(/data-slot="breadcrumb-page"[^>]*>([^<]+)</)?.[1]
const linkedPages = (html: string) =>
  [...html.matchAll(/href="([^"]+)"/g)]
    .map(([, href]) => href)
    .filter(href => href.startsWith(`${animePath}1001-2000/`))

afterEach(() => {
  vi.mocked(dictionaryService).mockReset()
})

describe('a rank band, a page of 200 ranks at a time', () => {
  test('the band’s URL shows its first 200 ranks, links its later pages, and names its ranks', async () => {
    serveBandTwo()
    const html = await rendered(BandPage(band('1001-2000')))
    expect(rows(html)).toBe(12)
    expect(lastCrumb(html)).toBe('1,001–1,200')
    expect(html).toContain('Ranks 1,001–1,200: 12 words.')
    expect(new Set(linkedPages(html))).toEqual(
      new Set(['2/', '3/', '4/'].map(page => `${animePath}1001-2000/${page}`))
    )
    const metadata = await generateMetadata(band('1001-2000'))
    expect(metadata.title).toContain('1,001–1,200')
    expect(metadata.alternates?.canonical).toBe(`${animePath}1001-2000/`)
    expect(metadata.robots).toBeUndefined()
  })

  test('a later page shows its own 200 ranks, under its own URL in each language', async () => {
    serveBandTwo()
    const html = await rendered(LaterBandPage(bandPage('1001-2000', '2')))
    expect(rows(html)).toBe(5)
    expect(lastCrumb(html)).toBe('1,201–1,400')
    expect(html).toContain('Ranks 1,201–1,400: 5 words.')
    const metadata = await laterPageMetadata(bandPage('1001-2000', '2'))
    expect(metadata.title).toContain('1,201–1,400')
    expect(metadata.description).toContain('Ranks 1,201–1,400.')
    expect(metadata.alternates).toEqual({
      canonical: `${animePath}1001-2000/2/`,
      languages: {
        en: `${animePath}1001-2000/2/`,
        ja: `/ja${animePath}1001-2000/2/`,
        'x-default': `${animePath}1001-2000/2/`
      }
    })
    const japanese = await laterPageMetadata(bandPage('1001-2000', '2', 'ja'))
    expect(japanese.title).toContain('1,201〜1,400位')
    expect(japanese.alternates?.canonical).toBe(`/ja${animePath}1001-2000/2/`)
  })

  test('a page of fewer than 10 words isn’t indexed', async () => {
    serveBandTwo()
    expect((await laterPageMetadata(bandPage('1001-2000', '2'))).robots).toEqual({
      index: false,
      follow: true
    })
    expect(rows(await rendered(LaterBandPage(bandPage('1001-2000', '4'))))).toBe(3)
  })

  test('page 1 redirects to the band’s URL, in the same language', async () => {
    serveBandTwo()
    expect(await redirectOf(LaterBandPage(bandPage('1001-2000', '1')))).toBe(
      `${animePath}1001-2000/`
    )
    expect(await redirectOf(laterPageMetadata(bandPage('1-1000', '1', 'ja')))).toBe(
      `/ja${animePath}1-1000/`
    )
  })

  test.each([
    ['a page past the band’s last ranked word', bandPage('1001-2000', '5')],
    ['a page past a band’s five', bandPage('1001-2000', '6')],
    ['page 0', bandPage('1001-2000', '0')],
    ['a band that isn’t one', bandPage('1001-1999', '1')],
    ['a list the site doesn’t have', bandPage('1001-2000', '1', 'en', 'no-such-list')]
  ])('%s is 404', async (_, props) => {
    serveBandTwo()
    await expect(LaterBandPage(props)).rejects.toMatchObject(notFound)
  })

  test('on the fixtures, whose bands rank 20 words, a band is one page', async () => {
    vi.mocked(dictionaryService).mockResolvedValue(null)
    const html = await rendered(BandPage(band('1-1000')))
    expect(rows(html)).toBe(20)
    expect(lastCrumb(html)).toBe('Anime')
    expect(html).not.toContain('aria-label="Pages"')
    await expect(LaterBandPage(bandPage('1-1000', '2'))).rejects.toMatchObject(notFound)
  })
})
