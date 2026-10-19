import { sourceCredits } from '@zenbu/dictionary-core/sources/credits'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'
import { searchDictionary } from '@/lib/dictionary/data'
import { searchPath } from '@/lib/dictionary/urls'
import { coreText } from '@/lib/i18n/core-text'
import { fitsTitle } from '@/lib/snippets'
import { listedInJapanese, listedWithLicence, pageSourcesList } from '@/test/credits'
import { pageProps } from '@/test/page-props'
import { redirectOf } from '@/test/redirect'
import SearchIndexPage from '../page'
import SearchResultsPage, { generateMetadata } from './page'

vi.mock('next/navigation', async original =>
  (await import('@/test/redirect')).redirectingNavigation(original)
)
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: async () => ({ env: {} }) }))

const decodedSegment = (query: string, locale = 'en') => pageProps({ locale, query })

const encodedSegment = (query: string, locale = 'en') =>
  decodedSegment(encodeURIComponent(query), locale)

const searchBox = (q: string, locale = 'en') => ({
  params: Promise.resolve({ locale }),
  searchParams: Promise.resolve({ q })
})

const queriesWhoseUrlNeverMoved: [name: string, typed: string, searched: string][] = [
  ['English', 'eat', 'eat'],
  ['English in capitals', 'To Persevere', 'to persevere'],
  ['Japanese', '食べる', '食べる'],
  ['romaji beside Japanese', 'Taberu 食べる', 'taberu 食べる'],
  ['full-width letters', '\u{FF29}\u{FF52}\u{FF55}', 'iru'],
  ['a half-width kana and its voiced mark', '\u{FF76}\u{FF9E}', 'ガ'],
  ['leading and trailing spaces', '  iru ', 'iru'],
  ['a run of inner spaces', 'to   persevere', 'to persevere'],
  ['a tab', 'eat\tnow', 'eat now'],
  ['a newline', 'eat\nnow', 'eat now'],
  ['a carriage return and a newline', ' eat\r\nnow\n', 'eat now'],
  ['an ideographic space between words', '食べ\u{3000}る', '食べ る'],
  ['ideographic spaces around a word', '\u{3000}大丈夫\u{3000}', '大丈夫'],
  ['a no-break space', 'eat\u{A0}now', 'eat now'],
  ['U+FEFF around a word', '\u{FEFF}taberu\u{FEFF}', 'taberu'],
  ['U+FEFF between words', 'eat\u{FEFF}now', 'eat now'],
  ['a capital and a mark that lowercase to one letter', 'J\u{30C}', '\u{1F0}']
]

const queriesTheWebsiteNormalizedItsOwnWay: [name: string, typed: string, searched: string][] = [
  ['U+0085 between words, which is white space', 'eat\u{85}now', 'eat now'],
  ['U+0085 before a word', '\u{85}taberu', 'taberu'],
  ['a space carrying a combining mark', 'eat \u{301}now', 'eat now'],
  ['a tab carrying a combining mark', 'eat\t\u{301}now', 'eat now'],
  ['a spacing voiced mark, which folds to a space and a mark', 'あ\u{309B}', 'あ'],
  ['an acute accent typed as an apostrophe, which folds likewise', 'don\u{B4}t', 'don t']
]

describe('a search lives at the query the core searches', () => {
  test.each([
    ...queriesWhoseUrlNeverMoved,
    ...queriesTheWebsiteNormalizedItsOwnWay
  ])('%s', async (_, typed, searched) => {
    expect((await searchDictionary(typed)).query).toBe(searched)
    const url = searchPath(searched)
    const typedUrlRedirectsTo = typed === searched ? null : url
    expect(await redirectOf(SearchIndexPage(searchBox(typed)))).toBe(url)
    expect(await redirectOf(SearchResultsPage(encodedSegment(typed)))).toBe(typedUrlRedirectsTo)
    expect(await redirectOf(generateMetadata(decodedSegment(typed)))).toBe(typedUrlRedirectsTo)
    expect(await redirectOf(SearchResultsPage(encodedSegment(searched)))).toBeNull()
    expect((await generateMetadata(decodedSegment(searched))).alternates?.canonical).toBe(url)
  })

  test('a Japanese search keeps its language through every redirect', async () => {
    const url = `/ja${searchPath('to persevere')}`
    expect(await redirectOf(SearchIndexPage(searchBox('To Persevere', 'ja')))).toBe(url)
    expect(await redirectOf(SearchResultsPage(encodedSegment('To Persevere', 'ja')))).toBe(url)
    expect(await redirectOf(generateMetadata(decodedSegment('To Persevere', 'ja')))).toBe(url)
    expect(await redirectOf(SearchResultsPage(encodedSegment('\u{FEFF} ', 'ja')))).toBe(
      '/ja/dictionary/search/'
    )
  })

  test('a Japanese search page is titled for the English or the Japanese of its query', async () => {
    const english = await generateMetadata(decodedSegment('eat', 'ja'))
    expect(english.title).toBe('eatの日本語・意味')
    expect(english.alternates?.canonical).toBe(`/ja${searchPath('eat')}`)
    const japanese = await generateMetadata(decodedSegment('いる', 'ja'))
    expect(japanese.title).toBe('いるの英語・意味')
    expect(japanese.description).toBe(
      '「いる」の英語の意味を、一致する6語の読み方と一緒に紹介します。一覧の言葉を開くと、それぞれのアクセント、漢字、活用、例文まで確認できます。Zenbu Japaneseの和英辞典は、ウェブでもiPhoneアプリでも無料で使えます。'
    )
    expect((await generateMetadata(decodedSegment('いる'))).title).toBe('いる in Japanese')
  })

  test('a long query is shortened in the title, to keep it within 70 characters', async () => {
    const query = Array.from({ length: 30 }, () => 'persevere').join(' ')
    const { title } = await generateMetadata(decodedSegment(query))
    expect(fitsTitle(String(title)), String(title)).toBe(true)
    expect(title).toMatch(/^persevere .*… in Japanese$/)
  })

  test('a query of nothing but separators is no search', async () => {
    expect(await redirectOf(SearchIndexPage(searchBox('\u{FEFF} \u{85}')))).toBeNull()
    expect(await redirectOf(SearchResultsPage(encodedSegment('\u{FEFF} \u{85}')))).toBe(
      '/dictionary/search/'
    )
  })
})

describe('the results page’s heading', () => {
  test.each([
    ['iru', 'en', 'iru in Japanese'],
    ['いる', 'ja', 'いるの英語・意味'],
    ['qzxvkj', 'en', 'qzxvkj in Japanese']
  ])('%s (%s) is headed with its title', async (query, locale, heading) => {
    const html = renderToStaticMarkup(await SearchResultsPage(decodedSegment(query, locale)))
    expect(html).toMatch(new RegExp(`<h1 [^>]*>${heading}</h1>`))
    expect((await generateMetadata(decodedSegment(query, locale))).title).toBe(heading)
  })
})

describe('the results page’s Sources', () => {
  const rendered = async (query: string, locale = 'en') =>
    renderToStaticMarkup(await SearchResultsPage(decodedSegment(query, locale)))

  test('credit JMdict, KANJIDIC2, the JLPT lists, and TUBELEX, each with its licence', async () => {
    const base = [
      sourceCredits.jmdict,
      sourceCredits.kanjidic2,
      sourceCredits.jlpt,
      sourceCredits.tubelex
    ]
    expect(pageSourcesList(await rendered('iru'))).toEqual(base.map(listedWithLicence))
    expect(pageSourcesList(await rendered('iru', 'ja'))).toEqual(base.map(listedInJapanese))
  })

  test.each([
    'en',
    'ja'
  ] as const)('are left out of a search that finds nothing (%s)', async locale => {
    const html = await rendered('qzxvkj', locale)
    expect(html).toContain(coreText('No Dictionary Matches', locale))
    expect(html).not.toContain('<footer')
  })
})
