import { describe, expect, test, vi } from 'vitest'
import { interruptedSearch } from './database'
import { deinflect } from './deinflect'
import { lookupSegments, type Morpheme, type MorphologyAnalysis } from './morphology'
import { morphemes } from './morphology.fixture'
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
  entry('b2', 20, '閻魔', 'えんま', ['noun'], { fingerprint: 'enma', senseCount: 3 }),
  entry('b1', 10, '閻魔', 'えんま', ['noun'], { fingerprint: 'enma' }),
  entry('c1', 30, '少し', 'すこし', ['adverb']),
  entry('c2', 31, '遅れる', 'おくれる', ['ichidanVerb']),
  entry('c3', 32, 'ちょっと', 'ちょっと', ['adverb']),
  entry('c4', 33, '松', 'まつ', ['noun'], { senseCount: 3 }),
  entry('c5', 34, '待つ', 'まつ', ['godanVerb']),
  entry('c6', 35, 'さん', 'さん', ['suffix']),
  entry('c7', 36, 'とる', 'とる', ['godanVerb'], { senseCount: 3 }),
  entry('c8', 37, '取る', 'とる', ['godanVerb']),
  entry('c9', 38, '言える', 'いえる', ['ichidanVerb']),
  entry('c10', 39, '言う', 'いう', ['godanVerb'])
]

function japaneseFormsDatabase() {
  const params: (string | number)[][] = []
  const db: SearchDatabase = {
    async all<Row>(sql: string, bound: readonly (string | number)[]) {
      params.push([...bound])
      if (!sql.includes('FROM forms f') || !sql.includes('f.kind IN (0, 1)')) return []
      const matches = sql.includes('f.form IN')
        ? (form: string) => bound.includes(form)
        : (form: string) => form.includes(String(bound[0]))
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

const words = morphemes([
  ['日本語', '日本語', '名詞'],
  ['を', 'を', '助詞'],
  ['勉強', '勉強', '名詞'],
  ['し', 'する', '動詞'],
  ['た', 'た', '助動詞']
])

describe('capabilities', () => {
  test('sentence search is on only with an analyzer', () => {
    const analyze = async () => ({ words })
    expect(new DictionarySearch(japaneseFormsDatabase().db).features.sentenceSearch).toBe(false)
    expect(
      new DictionarySearch(japaneseFormsDatabase().db, { morphology: { analyze } }).features
    ).toEqual({
      sentenceSearch: true
    })
  })

  test('with an analyzer, a sentence lists its words as Discovered Words', async () => {
    const search = new DictionarySearch(japaneseFormsDatabase().db, {
      morphology: { analyze: async () => ({ words }) }
    })
    const results = await search.search('日本語を勉強した')
    expect(results.items.map(item => item.entry.headword)).toEqual(['日本語', '勉強', 'する'])
    expect(results).toMatchObject({ presentation: 'discoveredWords', resolution: 'analyzed' })
  })

  test('without an analyzer, the same sentence finds nothing', async () => {
    const results = await new DictionarySearch(japaneseFormsDatabase().db).search(
      '日本語を勉強した'
    )
    expect(results.items).toEqual([])
    expect(results.presentation).toBe('ranked')
  })

  test('the analyzer only runs when nothing matches directly, and its failures find nothing', async () => {
    const analyze = vi.fn(async (): Promise<MorphologyAnalysis> => {
      throw new Error('analyzer unavailable')
    })
    const search = new DictionarySearch(japaneseFormsDatabase().db, { morphology: { analyze } })
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

describe('phrases', () => {
  const analyzing = (words: Morpheme[]) =>
    new DictionarySearch(japaneseFormsDatabase().db, {
      morphology: { analyze: async () => ({ words }) }
    })
  const headwords = async (words: Morpheme[], query: string) =>
    (await analyzing(words).search(query)).items.map(item => item.entry.headword)

  test('a phrase lists its adverb beside its verb, as Discovered Words', async () => {
    const words = morphemes([
      ['すこし', 'すこし', '副詞', '少し'],
      ['おくれる', 'おくれる', '動詞', '遅れる'],
      ['か', 'か', '助詞'],
      ['も', 'も', '助詞']
    ])
    const results = await analyzing(words).search('すこしおくれるかも')
    expect(results.items.map(item => item.entry.headword)).toEqual(['少し', '遅れる'])
    expect(results).toMatchObject({ presentation: 'discoveredWords', resolution: 'analyzed' })
  })

  test('a phrase of one word and its particles lists that word', async () => {
    const words = morphemes([
      ['遅れる', '遅れる', '動詞'],
      ['か', 'か', '助詞'],
      ['も', 'も', '助詞']
    ])
    expect(await headwords(words, '遅れるかも')).toEqual(['遅れる'])
  })

  test('a lone suffix beside a name the analyzer didn’t know finds nothing', async () => {
    const [name, suffix] = morphemes([
      ['髙橋', '髙橋', '名詞'],
      ['さん', 'さん', '接尾辞']
    ])
    expect(await headwords([{ ...name, isOutOfVocabulary: true }, suffix], '髙橋さん')).toEqual([])
  })

  test('a kana word takes the entry the analyzer names, not another spelled the same', async () => {
    const words = morphemes([
      ['ちょっと', 'ちょっと', '副詞'],
      ['まっ', 'まつ', '動詞', '待つ'],
      ['て', 'て', '助詞']
    ])
    expect(await headwords(words, 'ちょっとまって')).toEqual(['ちょっと', '待つ'])
  })

  test('a kana verb takes the entry the analyzer names, over a kana entry spelled the same', async () => {
    const words = morphemes([
      ['ちょっと', 'ちょっと', '副詞'],
      ['とっ', 'とる', '動詞', '取る'],
      ['た', 'た', '助動詞']
    ])
    expect(await headwords(words, 'ちょっととった')).toEqual(['ちょっと', '取る'])
  })

  test('a word keeps its own entry when the analyzer names one read another way', async () => {
    const words = morphemes([
      ['ちょっと', 'ちょっと', '副詞'],
      ['言える', '言える', '動詞', '言う']
    ])
    expect(await headwords(words, 'ちょっと言える')).toEqual(['ちょっと', '言える'])
  })
})

describe('results', () => {
  test('a duplicated word takes its entry number from the entry that owns its lowest ID, though the other has more senses and ranks first', async () => {
    const [item] = (await new DictionarySearch(japaneseFormsDatabase().db).search('えんま')).items
    expect(item.entry).toMatchObject({ id: 'b1', sourceRecordId: 10 })
  })

  test('text binds up to its first NUL, as the app binds it', async () => {
    const { db, params } = japaneseFormsDatabase()
    await new DictionarySearch(db).search('日本語\u0000を')
    expect(params.flat().some(param => typeof param === 'string' && param.includes('\u0000'))).toBe(
      false
    )
  })

  test('a search stops, with an error that says so, once its client reports it interrupted', async () => {
    const { db } = japaneseFormsDatabase()
    const abandoned = new DictionarySearch({ all: db.all, interrupted: () => true })
    await expect(abandoned.search('日本語')).rejects.toThrow(interruptedSearch)
    const wanted = new DictionarySearch({ all: db.all, interrupted: () => false })
    expect((await wanted.search('日本語')).items.map(item => item.entry.id)).toEqual(['a1'])
  })

  test('changing one result leaves later searches alone', async () => {
    const search = new DictionarySearch(japaneseFormsDatabase().db)
    const first = await search.search('ぞ')
    first.items.push((await search.search('日本語')).items[0])
    first.presentation = 'discoveredWords'
    expect(await search.search('ぞ')).toMatchObject({ items: [], presentation: 'ranked' })

    deinflect('食べた')[0].wordClasses.push('godan')
    expect(deinflect('食べた')[0].wordClasses).not.toContain('godan')
  })
})
