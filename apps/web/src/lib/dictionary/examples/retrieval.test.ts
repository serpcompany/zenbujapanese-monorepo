import { describe, expect, test } from 'vitest'
import { graphemes } from '../detail/text'
import {
  type CorpusSentence,
  type EntryEvidence,
  type ExampleCorpus,
  entryTerms,
  findOccurrences,
  normalizedEntryEvidence,
  type RetrievalEntry,
  retrieveEntryExamples,
  retrieveEntryExamplesByScan,
  retrieveJapaneseExamples,
  retrieveJapaneseExamplesByScan
} from './retrieval'

interface TestEntry extends RetrievalEntry {
  readingForms: string[]
}

/** A corpus over `japanese`, with pair IDs in order unless given, for `entries`. */
function testCorpus(
  japanese: string[],
  entries: TestEntry[],
  options: {
    pairIds?: string[]
    index?: Record<string, { sentence: number; surface: string }[]>
  } = {}
): ExampleCorpus {
  const sentences: CorpusSentence[] = japanese.map((text, index) => ({
    pairId: options.pairIds?.[index] ?? index.toString(16).padStart(32, '0'),
    japanese: text,
    graphemeCount: graphemes(text).length
  }))
  const evidence = new Map<string, EntryEvidence>(
    entries.map(entry => [
      entry.id,
      {
        reading: entry.reading,
        writtenForms: new Set(entry.writtenForms),
        readingForms: new Set(entry.readingForms)
      }
    ])
  )
  const forms = {
    evidence: (id: string) => evidence.get(id) ?? null,
    unambiguousEntryCount: (selectedForm: string, reading: string) =>
      entries.filter(
        entry => entry.writtenForms.includes(selectedForm) && entry.readingForms.includes(reading)
      ).length
  }
  const terms = entries.flatMap(entry => {
    const found = entryTerms(entry, forms)
    return typeof found === 'object'
      ? [found.selectedForm, ...found.alternateForms, found.reading]
      : []
  })
  const occurrences = findOccurrences(sentences, terms)
  return {
    sentences,
    ...forms,
    occurrences: term => occurrences.get(term) ?? { occurrences: [], total: 0 },
    indexedSentences: id => options.index?.[id] ?? []
  }
}

const word = (id: string, headword: string, reading: string, written: string[] = [headword]) => ({
  id,
  headword,
  reading,
  writtenForms: written,
  readingForms: [reading]
})

const listed = (result: ReturnType<typeof retrieveEntryExamples>, corpus: ExampleCorpus) =>
  typeof result === 'string'
    ? result
    : result.sentences.map(index => corpus.sentences[index].japanese)

describe('retrieveEntryExamples', () => {
  test('ranks the selected form, then other written forms, then the reading', () => {
    const entry = word('a', '見る', 'みる', ['見る', '観る'])
    const corpus = testCorpus(['みるだけ', '観る', 'よく見る', '見る'], [entry])
    expect(listed(retrieveEntryExamples(entry, corpus), corpus)).toEqual([
      '見る',
      'よく見る',
      '観る',
      'みるだけ'
    ])
  })

  test('orders by position, then length, then pair ID', () => {
    const entry = word('a', '猫', 'ねこ')
    const corpus = testCorpus(['猫だ', 'この猫', '猫', '猫よ'], [entry], {
      pairIds: ['4', '1', '3', '2'].map(id => id.padStart(32, '0'))
    })
    expect(listed(retrieveEntryExamples(entry, corpus), corpus)).toEqual([
      '猫',
      '猫よ',
      '猫だ',
      'この猫'
    ])
  })

  test('counts positions in graphemes, not UTF-16 units', () => {
    const entry = word('a', '猫', 'ねこ')
    // 𠮷 is two UTF-16 units but one grapheme, so 猫 is at 1 in both.
    const corpus = testCorpus(['𠮷猫', 'あ猫あ'], [entry])
    expect(listed(retrieveEntryExamples(entry, corpus), corpus)).toEqual(['𠮷猫', 'あ猫あ'])
  })

  test('an entry sharing its form and reading with another has no examples', () => {
    const tsuma = word('a', '妻', 'つま')
    const other = word('b', '妻', 'つま')
    const corpus = testCorpus(['妻'], [tsuma, other])
    expect(retrieveEntryExamples(tsuma, corpus)).toEqual({
      sentences: [],
      count: 0,
      truncated: false
    })
  })

  test("an entry whose stored reading isn't among its reading forms fails", () => {
    const entry = { ...word('a', '猫', 'ねこ'), readingForms: ['にゃんこ'] }
    expect(retrieveEntryExamples(entry, testCorpus(['猫'], [entry]))).toBe('missingEntryEvidence')
  })

  test('a kana headword reads ExampleWordIndex, ranking its surfaces', () => {
    const entry = word('a', 'いる', 'いる', [])
    const corpus = testCorpus(['はいる', 'いた', 'いるよ'], [entry], {
      index: {
        a: [
          { sentence: 1, surface: 'い' },
          { sentence: 2, surface: 'いる' },
          { sentence: 0, surface: 'x' }
        ]
      }
    })
    // Its surface in the sentence: いる is the selected form, い the reading tier; x isn't there.
    expect(listed(retrieveEntryExamples(entry, corpus), corpus)).toEqual(['いるよ', 'いた'])
  })

  test('reports exact counts up to 50, and lists at most 100', () => {
    const entry = word('a', '猫', 'ねこ')
    const fifty = testCorpus(
      Array.from({ length: 50 }, (_, i) => `猫${'。'.repeat(i)}`),
      [entry]
    )
    expect(retrieveEntryExamples(entry, fifty)).toMatchObject({ count: 50, truncated: false })
    const many = testCorpus(
      Array.from({ length: 150 }, (_, i) => `猫${'。'.repeat(i)}`),
      [entry]
    )
    const result = retrieveEntryExamples(entry, many)
    expect(result).toMatchObject({ count: 51, truncated: true })
    expect(typeof result !== 'string' && result.sentences).toHaveLength(100)
  })

  test("matches the app's scan on random corpora, including terms with 1,000 sentences", () => {
    let seed = 7
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return seed / 2 ** 31
    }
    const pick = (alphabet: string, length: number) =>
      Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]).join('')
    const japanese = Array.from({ length: 1200 }, () =>
      pick('あいう猫犬', 2 + Math.floor(random() * 8))
    )
    const entries = Array.from({ length: 40 }, (_, i) =>
      word(`e${i}`, pick('猫犬あ', 1 + (i % 3)), pick('あいう', 1 + (i % 2)), [
        pick('猫犬あ', 1 + (i % 3)),
        pick('猫犬', 1 + (i % 2))
      ])
    ).map(entry => ({ ...entry, writtenForms: [entry.headword, ...entry.writtenForms] }))
    const corpus = testCorpus(japanese, entries)
    for (const entry of entries) {
      expect(retrieveEntryExamples(entry, corpus)).toEqual(
        retrieveEntryExamplesByScan(entry, corpus)
      )
    }
  })
})

test('normalizedEntryEvidence is NFKC with whitespace runs collapsed', () => {
  expect(normalizedEntryEvidence('ＣＤ　プレーヤー')).toBe('CD プレーヤー')
  expect(normalizedEntryEvidence(' ｶﾞ ')).toBe('ガ')
})

describe('retrieveJapaneseExamples (a Japanese search, as a form’s screen runs it)', () => {
  const japanese = [
    '猫を見た。',
    '見た',
    'あれを見たかった。',
    '見た目がいい。',
    '昨日見た。',
    '犬を見た'
  ]
  const sentences: CorpusSentence[] = japanese.map((text, index) => ({
    pairId: index.toString(16).padStart(32, '0'),
    japanese: text,
    graphemeCount: graphemes(text).length
  }))
  const occurrences = findOccurrences(sentences, ['見た'])
  const corpus = {
    sentences,
    occurrences: (term: string) => occurrences.get(term) ?? { occurrences: [], total: 0 }
  }

  test('lists the sentence that is the form first, then by position, length, and pair ID', () => {
    const found = retrieveJapaneseExamples('見た', corpus).map(index => japanese[index])
    expect(found).toEqual([
      '見た',
      '見た目がいい。',
      '犬を見た',
      '猫を見た。',
      '昨日見た。',
      'あれを見たかった。'
    ])
    expect(found).toEqual(
      retrieveJapaneseExamplesByScan('見た', sentences).map(index => japanese[index])
    )
  })

  test('lists at most 100, and nothing for an empty query', () => {
    const many: CorpusSentence[] = Array.from({ length: 150 }, (_, index) => ({
      pairId: index.toString(16).padStart(32, '0'),
      japanese: `見た${'。'.repeat(index % 7)}`,
      graphemeCount: 2 + (index % 7)
    }))
    const found = findOccurrences(many, ['見た'])
    const result = retrieveJapaneseExamples('見た', {
      sentences: many,
      occurrences: term => found.get(term) ?? { occurrences: [], total: 0 }
    })
    expect(result).toHaveLength(100)
    expect(result).toEqual(retrieveJapaneseExamplesByScan('見た', many))
    expect(retrieveJapaneseExamples('', corpus)).toEqual([])
  })
})
