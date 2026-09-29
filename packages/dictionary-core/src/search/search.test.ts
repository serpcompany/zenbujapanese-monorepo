import { describe, expect, test, vi } from 'vitest'
import { deinflect } from './deinflect'
import { lookupSegments, type MorphologyWord } from './morphology'
import { DictionarySearch, type SearchDatabase } from './search'

interface FakeEntry {
  id: string
  entSeq: number
  headword: string
  reading: string
  partsOfSpeech: string[]
  fingerprint: string
  senseCount: number
  forms: { form: string; kind: 0 | 1 }[]
}

const entry = (
  id: string,
  entSeq: number,
  headword: string,
  reading: string,
  partsOfSpeech: string[],
  options: { fingerprint?: string; senseCount?: number } = {}
): FakeEntry => ({
  id,
  entSeq,
  headword,
  reading,
  partsOfSpeech,
  fingerprint: options.fingerprint ?? id,
  senseCount: options.senseCount ?? 1,
  forms:
    headword === reading
      ? [{ form: reading, kind: 1 }]
      : [
          { form: headword, kind: 0 },
          { form: reading, kind: 1 }
        ]
})

const dictionary = [
  entry('a1', 1, '日本語', 'にほんご', ['noun']),
  entry('a2', 2, '勉強', 'べんきょう', ['noun', 'takesSuru']),
  entry('a3', 3, 'する', 'する', ['suruVerb']),
  // One word in two JMdict entries: the higher ID has more senses, so it ranks first.
  entry('b2', 20, '閻魔', 'えんま', ['noun'], { fingerprint: 'enma', senseCount: 3 }),
  entry('b1', 10, '閻魔', 'えんま', ['noun'], { fingerprint: 'enma' })
]

/**
 * Answers the Japanese form queries Search makes, from `dictionary`; English queries find
 * nothing. It reads each query's shape from its SQL, so it only suits Japanese searches.
 */
function fakeDatabase() {
  const params: (string | number)[][] = []
  const db: SearchDatabase = {
    async all<Row>(sql: string, bound: readonly (string | number)[]) {
      params.push([...bound])
      if (!sql.includes('FROM forms f') || !sql.includes('f.kind IN (0, 1)')) return []
      const matches = sql.includes('f.form IN')
        ? (form: string) => bound.includes(form)
        : (form: string) => form.includes(String(bound[1]))
      const rows = dictionary.flatMap(candidate =>
        candidate.forms
          .filter(({ form }) => matches(form))
          .map(({ form, kind }) => ({
            id: candidate.id,
            source_record_id: candidate.entSeq,
            headword: candidate.headword,
            reading: candidate.reading,
            summary: '',
            parts_of_speech_json: JSON.stringify(candidate.partsOfSpeech),
            semantic_fingerprint: candidate.fingerprint,
            primary_mask: null,
            secondary_mask: null,
            news_frequency_band: null,
            form,
            kind,
            sense_count: candidate.senseCount
          }))
      )
      return (sql.trimStart().startsWith('SELECT 1') ? rows.slice(0, 1) : rows) as Row[]
    }
  }
  return { db, params }
}

const words: MorphologyWord[] = [
  { surface: '日本語', dictionaryForm: '日本語', partOfSpeech: ['名詞'], isOutOfVocabulary: false },
  { surface: 'を', dictionaryForm: 'を', partOfSpeech: ['助詞'], isOutOfVocabulary: false },
  { surface: '勉強', dictionaryForm: '勉強', partOfSpeech: ['名詞'], isOutOfVocabulary: false },
  { surface: 'し', dictionaryForm: 'する', partOfSpeech: ['動詞'], isOutOfVocabulary: false },
  { surface: 'た', dictionaryForm: 'た', partOfSpeech: ['助動詞'], isOutOfVocabulary: false }
]

describe('capabilities', () => {
  test('sentence search is on only with an analyzer', () => {
    const analyze = async () => words
    expect(new DictionarySearch(fakeDatabase().db).features.sentenceSearch).toBe(false)
    expect(new DictionarySearch(fakeDatabase().db, { morphology: { analyze } }).features).toEqual({
      sentenceSearch: true
    })
  })

  test('with an analyzer, a sentence lists its words as Discovered Words', async () => {
    const search = new DictionarySearch(fakeDatabase().db, {
      morphology: { analyze: async () => words }
    })
    const results = await search.search('日本語を勉強した')
    expect(results.items.map(item => item.entry.headword)).toEqual(['日本語', '勉強', 'する'])
    expect(results).toMatchObject({ presentation: 'discoveredWords', resolution: 'analyzed' })
  })

  test('without an analyzer, the same sentence finds nothing', async () => {
    const results = await new DictionarySearch(fakeDatabase().db).search('日本語を勉強した')
    expect(results.items).toEqual([])
    expect(results.presentation).toBe('ranked')
  })

  test('the analyzer only runs when nothing matches directly, and its failures find nothing', async () => {
    const analyze = vi.fn(async (): Promise<MorphologyWord[]> => {
      throw new Error('analyzer unavailable')
    })
    const search = new DictionarySearch(fakeDatabase().db, { morphology: { analyze } })
    expect((await search.search('日本語')).items.map(item => item.entry.headword)).toEqual([
      '日本語'
    ])
    expect(analyze).not.toHaveBeenCalled()
    expect((await search.search('日本語を勉強した')).items).toEqual([])
    expect(analyze).toHaveBeenCalledOnce()
  })

  test('the website picks the words the app picks', () => {
    expect(lookupSegments(words)).toEqual(['日本語', '勉強', 'する'])
  })
})

describe('results', () => {
  test('a duplicated word takes its entry number from the entry that owns its ID', async () => {
    const [item] = (await new DictionarySearch(fakeDatabase().db).search('えんま')).items
    expect(item.entry).toMatchObject({ id: 'b1', sourceRecordId: 10 })
  })

  test('text binds up to its first NUL, as the app binds it', async () => {
    const { db, params } = fakeDatabase()
    await new DictionarySearch(db).search('日本語\u0000を')
    expect(params.flat().some(param => typeof param === 'string' && param.includes('\u0000'))).toBe(
      false
    )
  })

  test('changing one result leaves later searches alone', async () => {
    const search = new DictionarySearch(fakeDatabase().db)
    const first = await search.search('ぞ')
    first.items.push((await search.search('日本語')).items[0])
    first.presentation = 'discoveredWords'
    expect(await search.search('ぞ')).toMatchObject({ items: [], presentation: 'ranked' })

    deinflect('食べた')[0].wordClasses.push('godan')
    expect(deinflect('食べた')[0].wordClasses).not.toContain('godan')
  })
})
