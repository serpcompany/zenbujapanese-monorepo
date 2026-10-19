import { describe, expect, test } from 'vitest'
import type { SearchData } from '@/lib/dictionary/data'
import { locales } from '@/lib/i18n/config'
import { characters, descriptionLength, fitsTitle } from '@/lib/snippets'
import { plainRomaji, spellsReading } from './plain-romaji'
import { type SnippetSearch, searchSnippet, showsExampleSentences } from './search-snippet'

const word = (headword: string, reading: string) => ({ headword, reading })

const others = (count: number) => Array.from({ length: count }, () => word('他', 'ほか'))

const english = (
  query: string,
  words: SnippetSearch['words'],
  hasExamples = false
): SnippetSearch => ({ query, english: true, words, hasExamples })

const cat = english('cat', [word('猫', 'ねこ'), ...others(59)], true)
const hello = english('hello', [word('今日は', 'こんにちは'), ...others(3)])
const coffee = english('coffee', [word('コーヒー', 'コーヒー')])
const persevere = english('to persevere', [word('頑張る', 'がんばる'), ...others(1)], true)
const longQuery = english('to be left without means of sustenance', [
  word('路頭に迷う', 'ろとうにまよう'),
  ...others(4)
])

describe('an English search’s title, heading, and description', () => {
  test('say how to say the word in Japanese, with its top result', () => {
    expect(searchSnippet(cat, 'en')).toEqual({
      title: 'How to Say Cat in Japanese: 猫 (neko)',
      heading: 'Japanese Word for Cat: 猫 (ねこ, neko)',
      description:
        'Cat in Japanese is 猫 (ねこ, neko). See 59 more Japanese words for “cat”, with readings and meanings. Each word opens to its pitch accent, kanji, and examples.'
    })
    expect(searchSnippet(cat, 'ja')).toEqual({
      title: '「cat」の意味・和訳：猫（ねこ）・例文',
      heading: '「cat」の意味と日本語訳',
      description:
        '英語「cat」の意味・和訳は「猫（ねこ）」。ほか59語の日本語訳も、読み方と英語の意味付きで紹介します。一覧の言葉を開くと、それぞれのアクセント、漢字、活用、例文まで確認できます。Zenbu Japaneseの和英辞典は、ウェブでもiPhoneアプリでも無料で使えます。'
    })
  })

  test('keep small words of the query lowercase in a title', () => {
    expect(searchSnippet(persevere, 'en').title).toBe(
      'How to Say to Persevere in Japanese: 頑張る (ganbaru)'
    )
  })

  test('show the kana where a reading may end in a particle the romaji would misread', () => {
    expect(plainRomaji('こんにちは')).toBeNull()
    expect(searchSnippet(hello, 'en').title).toBe(
      'How to Say Hello in Japanese: 今日は (こんにちは)'
    )
    expect(searchSnippet(hello, 'en').heading).toBe('Japanese Word for Hello: 今日は (こんにちは)')
  })

  test('write the romaji without macrons, a kana word once, and say when it’s the only word', () => {
    expect(searchSnippet(coffee, 'en')).toEqual({
      title: 'How to Say Coffee in Japanese: コーヒー (kohi)',
      heading: 'Japanese Word for Coffee: コーヒー (kohi)',
      description:
        'Coffee in Japanese is コーヒー (kohi). It’s the only Japanese word found for “coffee”. Each word opens to its pitch accent, kanji, and examples.'
    })
    expect(searchSnippet(coffee, 'ja').title).toBe('「coffee」の意味・和訳：コーヒー')
  })

  test('drop the romaji, then the word, then “how to say”, when the title would pass 70 characters', () => {
    expect(searchSnippet(longQuery, 'en').title).toBe(
      'to be left without means of sustenance in Japanese'
    )
  })

  test.each(
    locales
  )('every title fits 70 characters and every description 110 to 160 (%s)', locale => {
    for (const search of [cat, hello, coffee, persevere, longQuery]) {
      const { title, description } = searchSnippet(search, locale)
      expect(fitsTitle(title), title).toBe(true)
      expect(characters(description), description).toBeGreaterThanOrEqual(
        descriptionLength.shortest
      )
      expect(characters(description), description).toBeLessThanOrEqual(descriptionLength.longest)
    }
  })
})

describe('a search that isn’t an English word keeps its plain title', () => {
  test.each([
    ['iru', 'いる'],
    ['neko', 'ねこ'],
    ['arigato', 'ありがとう'],
    ['konnichiwa', 'こんにちは'],
    ['ramen', 'らーめん']
  ])('a romaji search, %s, is titled with the query', (query, reading) => {
    expect(spellsReading(query, reading)).toBe(true)
    const snippet = searchSnippet(english(query, [word('語', reading), ...others(1)]), 'en')
    expect(snippet.title).toBe(`${query} in Japanese`)
    expect(snippet.heading).toBe(snippet.title)
  })

  test('a Japanese search and a search that finds nothing are titled with the query', () => {
    const japanese = {
      query: 'いる',
      english: false,
      words: [word('要る', 'いる')],
      hasExamples: false
    }
    expect(searchSnippet(japanese, 'ja').title).toBe('いるの英語・意味')
    expect(searchSnippet(english('qzxvkj', []), 'en').heading).toBe('qzxvkj in Japanese')
  })
})

describe('a search names example sentences only when it shows them', () => {
  const searched = (examples: unknown) => ({ state: 'results', examples }) as SearchData

  test('shown on the page, they are named', () => {
    expect(showsExampleSentences(searched({ target: { kind: 'inline' } }))).toBe(true)
  })

  test('linked on a word’s page, or not found, they are not', () => {
    const linked = { target: { kind: 'word', path: '/dictionary/要る-1546640/#examples' } }
    expect(showsExampleSentences(searched(linked))).toBe(false)
    expect(showsExampleSentences(searched(null))).toBe(false)
    expect(showsExampleSentences({ state: 'noResults', query: 'qzxvkj' } as SearchData)).toBe(false)
  })
})
