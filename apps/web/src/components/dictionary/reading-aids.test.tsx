import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import { conjugations } from '@/lib/dictionary/detail/conjugation'
import { romajiUnavailable } from '@/lib/dictionary/detail/examples'
import {
  type ReadingAidSettings,
  readingAidDefaults,
  wordMeaning
} from '@/lib/dictionary/detail/reading-aids'
import { romanizeTrustedReading } from '@/lib/dictionary/detail/romaji'
import { rubySegments } from '@/lib/dictionary/detail/ruby'
import { wordDetail } from '@/lib/dictionary/detail/word'
import { dictionaryDatabase } from '@/lib/dictionary/dictionary-db'
import { readingAidAttributes, readingAidStorageKey, readingAidsScript } from '@/lib/reading-aids'
import { ConjugationTableContent } from './conjugations'
import { ExampleList } from './example-list'
import { aidClasses, rtClass } from './reading-aid'
import { readAidMarkup, readExampleAids, readHeadline, readRomajiOf } from './rendered-aids'
import { WordHeader } from './word-header'
import { AlternativeForms, RelatedWords } from './word-sections'

// Reading Aids on the rendered word page, under each setting: the page renders every aid's text,
// and each is shown or hidden by its setting's attribute on <html> through the class reading-aid.tsx
// gives it. The first tests hold that contract (each aid's class, globals.css's variants, and the
// inline script that sets the attributes) and draw fixed data under each setting; the last draw
// every word-detail.json case's headline, related words, alternative readings, and examples
// through the dictionary database into the components under each setting, and compare what shows
// with what the app recorded (ZENBU_DICTIONARY_D1=1, part of the dictionary import's gate).

const settings: [string, ReadingAidSettings][] = [
  ['the defaults', readingAidDefaults],
  ['Furigana off', { ...readingAidDefaults, furigana: false }],
  ['Romaji on', { ...readingAidDefaults, romaji: true }],
  ['Word Meanings on', { ...readingAidDefaults, wordMeanings: true }],
  ['Sentence Translations off', { ...readingAidDefaults, translations: false }]
]

const wordSuite = () =>
  JSON.parse(
    readFileSync(
      new URL('../../../../ios/LanguageData/Conformance/word-detail.json', import.meta.url),
      'utf8'
    )
  )

const miru = {
  ruby: rubySegments('見る', 'みる'),
  reading: 'みる',
  romaji: 'miru',
  readingWithoutFurigana: 'みる',
  summary: 'to see',
  partOfSpeech: 'Ichidan verb (transitive)',
  pitch: null
}

const miruHeader = renderToStaticMarkup(<WordHeader {...miru} conjugations={null} />)

const example = {
  position: 0,
  text: '見るからに明らかだよ。',
  romaji: 'miru kara ni akiraka da yo。',
  translation: "It's obvious at a glance.",
  japanese: { id: 1, contributor: null, license: 'CC BY 2.0 FR' },
  english: { id: 2, contributor: null, license: 'CC BY 2.0 FR' },
  tokens: [
    {
      text: '見る',
      ruby: rubySegments('見る', 'みる'),
      link: { entSeq: 1259290 },
      isPageWord: true,
      functionWord: false,
      path: '/dictionary/見る-1259290/',
      meaning: 'see'
    },
    {
      text: 'から',
      ruby: [{ text: 'から' }],
      link: { entSeq: 1002980 },
      isPageWord: false,
      functionWord: true,
      path: null,
      meaning: null
    }
  ]
}

const examples = renderToStaticMarkup(
  <ExampleList initial={[example]} listed={1} path="/dictionary/examples/1.json?build=b" />
)

describe('Reading Aids', () => {
  test('default to the app’s: Furigana and Sentence Translations on, the rest off', () => {
    expect(readingAidDefaults).toEqual({
      furigana: true,
      romaji: false,
      wordMeanings: false,
      translations: true
    })
    // A new install's settings, as the app recorded them.
    const recorded = wordSuite().readingAidDefaults
    expect(readingAidDefaults).toEqual({
      furigana: recorded.showsFurigana,
      romaji: recorded.showsRomaji,
      wordMeanings: recorded.showsWordMeanings,
      translations: recorded.showsTranslations
    })
  })

  test('every aid carries the class that hides it, and globals.css keys each to its setting', () => {
    const table = conjugations(
      { headword: '来る', reading: 'くる', partsOfSpeech: ['kuruVerb'] },
      new Map()
    )
    if (!table) throw new Error('来る has no table')
    const html = [
      miruHeader,
      examples,
      renderToStaticMarkup(
        <RelatedWords
          related={[
            {
              headword: '有る',
              reading: 'ある',
              ruby: rubySegments('有る', 'ある'),
              relation: 'See also',
              summary: 'to be',
              entSeq: 1296400,
              romaji: 'aru',
              path: null
            }
          ]}
        />
      ),
      renderToStaticMarkup(
        <ConjugationTableContent
          word={miru}
          conjugations={table}
          mode="Plain"
          onModeChange={() => {}}
          onSelect={() => {}}
        />
      )
    ].join('')
    const markup = readAidMarkup(html)
    expect(new Set(markup.map(aid => aid.kind))).toEqual(
      new Set(['furigana', 'romaji', 'readingWithoutFurigana', 'wordMeaning', 'translation'])
    )
    for (const { kind, className } of markup) {
      const expected = kind === 'furigana' ? rtClass : aidClasses[kind as keyof typeof aidClasses]
      for (const name of expected.split(' ')) expect(className.split(' ')).toContain(name)
    }
    const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')
    for (const [variant, attribute, value] of [
      ['furigana-off', readingAidAttributes.furigana, 'off'],
      ['romaji-on', readingAidAttributes.romaji, 'on'],
      ['word-meanings-on', readingAidAttributes.wordMeanings, 'on'],
      ['translations-off', readingAidAttributes.translations, 'off']
    ]) {
      expect(css).toContain(`@custom-variant ${variant} (&:where([${attribute}="${value}"] *));`)
    }
  })

  test.each([
    ['nothing stored', null, readingAidDefaults],
    ['Romaji on', '{"romaji":true}', { ...readingAidDefaults, romaji: true }],
    [
      'everything changed',
      '{"furigana":false,"romaji":true,"wordMeanings":true,"translations":false}',
      { furigana: false, romaji: true, wordMeanings: true, translations: false }
    ],
    ['something unreadable', '{not json', readingAidDefaults],
    ['a wrong type', '{"furigana":"no"}', readingAidDefaults]
  ])('the inline script sets each aid on <html> before paint, with %s', (_, stored, expected) => {
    const window = new Window()
    if (stored !== null) window.localStorage.setItem(readingAidStorageKey, stored)
    new Function('localStorage', 'document', readingAidsScript)(
      window.localStorage,
      window.document
    )
    const root = window.document.documentElement
    for (const [aid, attribute] of Object.entries(readingAidAttributes)) {
      expect(root.getAttribute(attribute)).toBe(
        expected[aid as keyof ReadingAidSettings] ? 'on' : 'off'
      )
    }
  })

  test.each(settings)('the headline and an example under %s', (_, setting) => {
    expect(readHeadline(miruHeader, setting)).toEqual({
      furigana: setting.furigana,
      romaji: setting.romaji ? 'miru' : null,
      readingWithoutFurigana: setting.furigana ? null : 'みる'
    })
    expect(readExampleAids(examples, setting)).toEqual([
      {
        romaji: setting.romaji ? 'miru kara ni akiraka da yo。' : null,
        // A particle shows no meaning.
        meanings: setting.wordMeanings ? ['see'] : [],
        translation: setting.translations ? "It's obvious at a glance." : null,
        furigana: setting.furigana ? 1 : 0
      }
    ])
  })

  test('says romaji is unavailable when a word can’t be romanized', () => {
    const html = renderToStaticMarkup(
      <ExampleList initial={[{ ...example, romaji: null }]} listed={1} path="/x?build=b" />
    )
    expect(readExampleAids(html, { ...readingAidDefaults, romaji: true })[0].romaji).toBe(
      romajiUnavailable
    )
  })

  test('an alternative reading shows its romaji; a written form has none', () => {
    const html = renderToStaticMarkup(
      <AlternativeForms
        forms={[
          { value: '居る', kind: 'written', labels: [], kanji: '居', romaji: null, path: null },
          {
            value: 'おる',
            kind: 'reading',
            labels: [],
            kanji: null,
            romaji: romanizeTrustedReading('おる'),
            path: null
          }
        ]}
      />
    )
    const on = { ...readingAidDefaults, romaji: true }
    expect(readRomajiOf(html, '[data-alternative-form]', on)).toEqual([null, 'oru'])
    expect(readRomajiOf(html, '[data-alternative-form]', readingAidDefaults)).toEqual([null, null])
  })
})

const enabled = process.env.ZENBU_DICTIONARY_D1 === '1'

interface SuiteCase {
  covers: string
  entSeq: string[]
  readingAids: { romaji?: string; readingWithoutFurigana?: string }
  alternativeForms: { kind: string; romaji?: string }[]
  relatedWords: { romaji?: string }[]
  examples: {
    shown: { english: string; romaji?: string; tokens: { meaning?: string }[] }[]
  }
}

const suiteCases: SuiteCase[] = enabled ? wordSuite().cases : []

describe.runIf(enabled)('the rendered word page’s Reading Aids match the app', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<CloudflareEnv>>>
  let dictionary: ReturnType<typeof dictionaryDatabase>

  beforeAll(async () => {
    proxy = await getPlatformProxy<CloudflareEnv>({
      persist: { path: `${process.env.ZENBU_DICTIONARY_D1_PATH ?? '.dictionary-d1'}/v3` }
    })
    if (!proxy.env.DICTIONARY_DB)
      throw new Error('wrangler.jsonc has no local DICTIONARY_DB binding')
    dictionary = dictionaryDatabase(proxy.env.DICTIONARY_DB)
  })

  afterAll(async () => {
    await proxy?.dispose()
  })

  test.each(suiteCases)('$covers', async expected => {
    const word = await dictionary.word(Number(expected.entSeq[0]))
    if (!word) throw new Error(`No word ${expected.entSeq[0]}`)
    const detail = wordDetail(word.rows)
    const header = renderToStaticMarkup(
      <WordHeader {...detail} conjugations={detail.conjugations} />
    )
    const related = renderToStaticMarkup(
      <RelatedWords related={detail.related.map(item => ({ ...item, path: null }))} />
    )
    const readings = detail.alternatives.filter(form => form.kind === 'reading')
    const alternatives = renderToStaticMarkup(
      <AlternativeForms forms={readings.map(form => ({ ...form, path: null }))} />
    )
    // The page's examples, with each word's meaning as data.ts adds it.
    const initial = detail.examples.map(item => ({
      ...item,
      tokens: item.tokens.map(token => ({
        ...token,
        path: null,
        meaning:
          token.link && 'entSeq' in token.link
            ? wordMeaning(token, word.exampleMeanings.get(token.link.entSeq))
            : null
      }))
    }))
    const exampleHtml = renderToStaticMarkup(
      <ExampleList initial={initial} listed={initial.length} path="/x?build=b" />
    )
    const shown = expected.examples.shown.slice(0, initial.length)
    for (const [, setting] of settings) {
      const headline = readHeadline(header, setting)
      expect(headline.romaji).toBe(setting.romaji ? (expected.readingAids.romaji ?? null) : null)
      expect(headline.readingWithoutFurigana).toBe(
        setting.furigana ? null : (expected.readingAids.readingWithoutFurigana ?? null)
      )
      expect(readRomajiOf(related, '[data-related-word]', setting)).toEqual(
        expected.relatedWords.map(item => (setting.romaji ? (item.romaji ?? null) : null))
      )
      expect(readRomajiOf(alternatives, '[data-alternative-form]', setting)).toEqual(
        expected.alternativeForms
          .filter(form => form.kind === 'reading')
          .map(form => (setting.romaji ? (form.romaji ?? null) : null))
      )
      expect(readExampleAids(exampleHtml, setting).map(({ furigana: _, ...aids }) => aids)).toEqual(
        shown.map(item => ({
          romaji: setting.romaji ? (item.romaji ?? romajiUnavailable) : null,
          meanings: setting.wordMeanings
            ? item.tokens.flatMap(token => (token.meaning ? [token.meaning] : []))
            : [],
          translation: setting.translations ? item.english : null
        }))
      )
    }
  })
})
