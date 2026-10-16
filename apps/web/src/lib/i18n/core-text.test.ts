import { fixtureKanjiRows, fixtureWordRows } from '@zenbu/dictionary-core/fixtures'
import { describe, expect, test, vi } from 'vitest'
import { searchDictionary } from '@/lib/dictionary/data'
import {
  everyCoreLabel,
  fixtureQueries,
  kanjiLabels,
  type Label,
  searchLabels,
  wordLabels
} from '@/test/core-labels'
import { englishLeftIn } from '@/test/japanese-text'
import { coreText, sourceLang } from './core-text'

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: async () => ({ env: {} }) }))

function untranslated(labels: readonly Label[]): string[] {
  return [
    ...new Set(
      labels.flatMap(({ text, data }) =>
        englishLeftIn(coreText(text, 'ja'), data) === null ? [] : [text]
      )
    )
  ]
}

describe('the core’s labels on Japanese pages', () => {
  test('every fixture word’s labels read in Japanese', () => {
    expect(untranslated(fixtureWordRows.flatMap(wordLabels))).toEqual([])
  })

  test('every fixture kanji’s labels read in Japanese', () => {
    expect(untranslated(fixtureKanjiRows.flatMap(kanjiLabels))).toEqual([])
  })

  test('every fixture search’s labels read in Japanese', async () => {
    const searches = await Promise.all(fixtureQueries.map(query => searchDictionary(query)))
    expect(searches.some(search => search.state === 'results' && search.kanji)).toBe(true)
    expect(untranslated(searches.flatMap(searchLabels))).toEqual([])
  })

  test('every label the core can write reads in Japanese', () => {
    const labels = everyCoreLabel()
    expect(labels.length).toBeGreaterThan(300)
    expect(untranslated(labels)).toEqual([])
  })
})

describe('coreText', () => {
  test('the check above finds a label the table has no Japanese for', () => {
    expect(
      untranslated([{ text: 'An unknown label' }, { text: 'Godan verb · A new tag' }])
    ).toEqual(['An unknown label', 'Godan verb · A new tag'])
  })

  test('leaves English pages exactly as the core writes them', () => {
    for (const { text } of everyCoreLabel()) expect(coreText(text, 'en')).toBe(text)
  })

  test('translates templated labels around the values they carry', () => {
    expect(coreText('View 12 Example Sentences', 'ja')).toBe('例文を見る（12件）')
    expect(coreText('Pitch accent, downstep 2, 3 mora', 'ja')).toBe('アクセント：2型、3拍')
    expect(coreText('Grade 4', 'ja')).toBe('小学4年')
    expect(coreText('JLPT N5', 'ja')).toBe('JLPT N5')
    expect(coreText('Godan verb (intransitive) · Suffix', 'ja')).toBe('五段動詞（自動詞）・接尾辞')
  })

  test('leaves source data alone, which pages mark as English', () => {
    expect(coreText('to be needed, to be necessary', 'ja')).toBe('to be needed, to be necessary')
    expect(coreText('to see · to look', 'ja')).toBe('to see · to look')
    expect(sourceLang('ja')).toBe('en')
    expect(sourceLang('en')).toBeUndefined()
  })
})
