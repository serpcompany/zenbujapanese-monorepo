import { describe, expect, test, vi } from 'vitest'
import { searchDictionary } from '@/lib/dictionary/data'
import { searchPath } from '@/lib/dictionary/urls'
import SearchIndexPage from '../page'
import SearchResultsPage, { generateMetadata } from './page'

const { Redirect } = vi.hoisted(() => ({
  Redirect: class extends Error {
    constructor(readonly path: string) {
      super(`redirects to ${path}`)
    }
  }
}))

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: async () => ({ env: {} }) }))
vi.mock('next/navigation', () => ({
  permanentRedirect: (path: string) => {
    throw new Redirect(path)
  }
}))

const redirectOf = (opened: Promise<unknown>) =>
  opened.then(
    () => null,
    (error: unknown) => {
      if (error instanceof Redirect) return error.path
      throw error
    }
  )

const decodedSegment = (query: string) => ({
  params: Promise.resolve({ query }),
  searchParams: Promise.resolve({})
})

const encodedSegment = (query: string) => decodedSegment(encodeURIComponent(query))

const searchBox = (q: string) => ({
  params: Promise.resolve({}),
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
  ['a no-break space', 'eat\u{A0}now', 'eat now']
]

const queriesTheWebsiteNormalizedItsOwnWay: [name: string, typed: string, searched: string][] = [
  ['U+FEFF before a word, which is no whitespace', '\u{FEFF}taberu', '\u{FEFF}taberu'],
  ['U+FEFF between words', 'eat\u{FEFF}now', 'eat\u{FEFF}now'],
  ['U+0085 between words, which is whitespace', 'eat\u{85}now', 'eat now'],
  ['U+0085 before a word', '\u{85}taberu', 'taberu'],
  ['a space carrying a combining mark', 'eat \u{301}now', 'eat now'],
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
})
