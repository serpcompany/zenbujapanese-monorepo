import { describe, expect, test } from 'vitest'
import { fixtureDictionary, fixtureFiles } from '../examples/ipadic.fixture'
import { morphemes } from '../search/morphology.fixture'
import { embeddedEndpoint } from './dictionary'
import { ask, begin, fakeHost, settled } from './fake-host'
import type {
  EmbeddedEntryExamples,
  EmbeddedExamplePage,
  EmbeddedMeaningExample,
  EmbeddedResultsExamples,
  EmbeddedToken
} from './text'
import { entries, host, linked, sentences } from './text-fixture'

const pairId = (row: number) => row.toString(16).padStart(32, '0')

function listing(japanese: string | readonly string[], matching: number) {
  const texts = typeof japanese === 'string' ? [japanese] : japanese
  const dictionary = host()
  const all = (sql: string, parametersJSON: string) => {
    if (sql.includes('JOIN forms f ON f.entry_id = e.id')) {
      return {
        rows: [
          { reading: 'みる', form: '見る', kind: 0 },
          { reading: 'みる', form: 'みる', kind: 1 }
        ]
      }
    }
    if (sql.includes('e.written_forms_json AS writtenForms')) {
      return { rows: [{ id: 'v1', writtenForms: JSON.stringify([{ value: '見る' }]) }] }
    }
    if (!sql.includes('FROM example_sentences e')) {
      return dictionary.all?.(sql, parametersJSON) ?? null
    }
    return {
      rows: Array.from({ length: matching }, (_, row) => ({
        rowid: row + 1,
        pairId: pairId(row),
        japanese: texts[row % texts.length],
        english: `Sentence ${row}.`
      }))
    }
  }
  return { ...dictionary, all }
}

const accents = (words: readonly EmbeddedToken[]) =>
  words.map(word => [word.surface, word.entry, word.accent])

describe('the embedded text engine', () => {
  test('links each word of a text to its entry, or lists the entries it could be', async () => {
    const target = host()
    expect(
      await linked(target, { text: '日本語を見た', query: '見た', highlightedEntry: null })
    ).toEqual([
      {
        surface: '日本語',
        start: 0,
        end: 3,
        reading: 'ニホンゴ',
        isFunctionWord: false,
        entry: 'a1',
        candidates: [],
        furigana: 'にほんご',
        ruby: [{ text: '日本語', reading: 'にほんご' }],
        accent: null,
        attaches: null
      },
      {
        surface: 'を',
        start: 3,
        end: 4,
        reading: 'ヲ',
        isFunctionWord: true,
        entry: null,
        candidates: ['p1', 'p2'],
        furigana: null,
        ruby: null,
        accent: null,
        attaches: null
      },
      {
        surface: '見た',
        start: 4,
        end: 6,
        reading: 'ミタ',
        isFunctionWord: false,
        entry: 'v1',
        candidates: [],
        furigana: 'みた',
        ruby: [{ text: '見', reading: 'み' }, { text: 'た' }],
        accent: null,
        attaches: null
      }
    ])
  })

  test('asks the dictionary once for a text’s words and once for the entries it links', async () => {
    const target = host()
    const endpoint = embeddedEndpoint(target)
    const request = JSON.stringify({ text: '日本語を見た', query: '', highlightedEntry: null })
    await settled(endpoint.begin('linkedTokens', request))
    expect(target.asked).toEqual([['日本語', 'を', '見る'], ['["a1","v1"]']])
    expect(await settled(endpoint.begin('linkedTokens', request))).toMatchObject({
      value: [{ entry: 'a1' }, { candidates: ['p1', 'p2'] }, { entry: 'v1' }]
    })
    expect(target.asked).toHaveLength(2)
  })

  test('reads a word the page’s entry is written as as that entry, without looking it up', async () => {
    const target = host()
    const tokens = await linked(target, {
      text: '日本語を見た',
      query: ' 見る ',
      highlightedEntry: 'v1'
    })
    expect(accents(tokens)).toEqual([
      ['日本語', 'a1', null],
      ['を', null, null],
      ['見た', 'v1', 'entry']
    ])
    expect(target.asked).toEqual([['["v1"]'], ['日本語', 'を'], ['["a1"]']])
  })

  test('shows the entry’s own reading over a word written as one of its forms', async () => {
    const [today] = await linked(host(), { text: '今日', query: '', highlightedEntry: null })
    expect(today).toMatchObject({
      entry: 'k1',
      reading: 'コンニチ',
      furigana: 'きょう',
      ruby: [{ text: '今日', reading: 'きょう' }]
    })
  })

  test('shows a text the tokenizer cannot read, or does not cover, as one unlinked word', async () => {
    const whole = (text: string) => [
      {
        surface: text,
        start: 0,
        end: [...text].length,
        reading: null,
        isFunctionWord: false,
        entry: null,
        candidates: [],
        furigana: null,
        ruby: null,
        accent: null,
        attaches: null
      }
    ]
    expect(await linked(host(), { text: '猫𠀋', query: '', highlightedEntry: null })).toEqual(
      whole('猫𠀋')
    )
    expect(await linked(host(), { text: '欠けた分析', query: '', highlightedEntry: null })).toEqual(
      whole('欠けた分析')
    )
    expect(await linked(host(), { text: '', query: '', highlightedEntry: null })).toEqual([])
  })

  test('asks the host for a text’s words when it has no tokenizer of its own', async () => {
    const call = begin(
      fakeHost(entries),
      'linkedTokens',
      JSON.stringify({ text: '見た日本語', query: '', highlightedEntry: null })
    )
    expect(await settled(call)).toEqual({ analyze: '見た日本語' })
    call.analyzed(
      JSON.stringify({
        words: morphemes([
          ['見た', '見た', '名詞'],
          ['日本語', '日本語', '名詞']
        ]),
        pieces: morphemes([
          ['見', '見る', '動詞'],
          ['た', 'た', '助動詞']
        ])
      })
    )
    const { value } = await settled(call)
    expect(
      (value as EmbeddedToken[]).map(found => [found.surface, found.entry, found.reading])
    ).toEqual([
      ['見た', 'x1', '見た'],
      ['日本語', 'a1', '日本語']
    ])
  })

  test('tokenizes with the dictionary files a host hands it, read when first needed', async () => {
    const files = fixtureFiles(fixtureDictionary)
    const read: string[] = []
    const reading = fakeHost(
      [
        { id: 't1', headword: '東京', reading: 'とうきょう' },
        { id: 'i1', headword: '行く', reading: 'いく', partsOfSpeech: ['godanVerb'] }
      ],
      {
        tokenizerFile: file => {
          read.push(file)
          return files[file]
        }
      }
    )
    const endpoint = embeddedEndpoint(reading)
    expect(read).toEqual([])
    expect(endpoint.answer('tokenizerReady', '')).toBe(true)
    expect(read.length).toBe(Object.keys(files).length)
    const call = endpoint.begin(
      'linkedTokens',
      JSON.stringify({ text: '東京に行く', query: '', highlightedEntry: null })
    )
    const { value } = await settled(call)
    expect((value as EmbeddedToken[]).map(found => [found.surface, found.entry])).toEqual([
      ['東京', 't1'],
      ['に', null],
      ['行く', 'i1']
    ])
    expect(read.length).toBe(Object.keys(files).length)
  })

  test("says whether it can tokenize: with a host's tokenizer, its files, or neither", () => {
    expect(embeddedEndpoint(host()).answer('tokenizerReady', '')).toBe(true)
    expect(embeddedEndpoint(fakeHost(entries)).answer('tokenizerReady', '')).toBe(false)
    const withoutFiles = fakeHost(entries, { tokenizerFile: () => null })
    expect(embeddedEndpoint(withoutFiles).answer('tokenizerReady', '')).toBe(false)
  })

  test('marks punctuation that stays with a neighbouring word', async () => {
    const found = await linked(host(), {
      text: '「日本語を」',
      query: '',
      highlightedEntry: null
    })
    expect(found.map(word => [word.surface, word.attaches])).toEqual([
      ['「', 'next'],
      ['日本語', null],
      ['を', null],
      ['」', 'previous']
    ])
  })

  test('answers a query’s examples a page at a time, linked, with the query’s words accented', async () => {
    const page = (matching: number, from: number) =>
      ask(
        listing('日本語を見た', matching),
        'resultsExamples',
        JSON.stringify({ query: '見た', primaryEntry: null, usesPrimaryEntryExamples: false, from })
      ) as Promise<EmbeddedResultsExamples>

    expect(await page(0, 0)).toEqual({
      examples: [],
      listed: 0,
      cutShort: false,
      countText: null
    })
    const first = await page(60, 0)
    expect(first).toMatchObject({ listed: 60, countText: '60 examples' })
    expect(first.examples.map(example => example.id)).toEqual(
      Array.from({ length: 25 }, (_, row) => `esp1_${pairId(row)}`)
    )
    expect(first.examples[0]).toMatchObject({ japanese: '日本語を見た', english: 'Sentence 0.' })
    expect(accents(first.examples[0].words)).toEqual([
      ['日本語', 'a1', null],
      ['を', null, null],
      ['見た', 'v1', 'query']
    ])
    const last = await page(60, 50)
    expect(last.examples.map(example => example.id)).toEqual(
      Array.from({ length: 10 }, (_, row) => `esp1_${pairId(50 + row)}`)
    )
    expect((await page(1, 0)).countText).toBe('1 example')
    expect((await page(100, 0)).countText).toBe('100 examples')
    const hundred = await page(101, 75)
    expect(hundred).toMatchObject({
      listed: 100,
      countText: 'The first 100 of more than 100 examples'
    })
    expect(hundred.examples).toHaveLength(25)
    expect((await page(101, 100)).examples).toEqual([])
  })

  test('answers as many examples as a screen asks for, then the rest of that page', async () => {
    const batch = async (from: number, limit?: number) => {
      const found = (await ask(
        listing('日本語を見た', 60),
        'resultsExamples',
        JSON.stringify({
          query: '見た',
          primaryEntry: null,
          usesPrimaryEntryExamples: false,
          from,
          limit
        })
      )) as EmbeddedResultsExamples
      expect(found).toMatchObject({ listed: 60, countText: '60 examples' })
      return { ids: found.examples.map(example => example.id), cutShort: found.cutShort }
    }
    const rows = (from: number, to: number, cutShort = false) => ({
      ids: Array.from({ length: to - from }, (_, row) => `esp1_${pairId(from + row)}`),
      cutShort
    })

    expect(await batch(0, 8)).toEqual(rows(0, 8, true))
    expect(await batch(8)).toEqual(rows(8, 25))
    expect(await batch(8, 40)).toEqual(rows(8, 25))
    expect(await batch(0, 25)).toEqual(rows(0, 25))
    expect(await batch(25, 3)).toEqual(rows(25, 28, true))
    expect(await batch(50, 40)).toEqual(rows(50, 60))
    expect(await batch(52, 8)).toEqual(rows(52, 60))
    expect(await batch(0, 0)).toEqual(rows(0, 25))
    expect(await batch(0, -1)).toEqual(rows(0, 25))
    expect(await batch(75)).toEqual({ ids: [], cutShort: false })
  })

  test('reads the words and the entries of a batch of examples from the dictionary together', async () => {
    const target = listing(['今日見た', '日本語を見た'], 2)
    const page = (await ask(
      target,
      'resultsExamples',
      JSON.stringify({
        query: '見た',
        primaryEntry: null,
        usesPrimaryEntryExamples: false,
        from: 0
      })
    )) as EmbeddedResultsExamples
    expect(page.examples.map(example => example.words.map(word => word.entry))).toEqual([
      ['k1', 'v1'],
      ['a1', null, 'v1']
    ])
    expect(target.asked).toEqual([['今日', '見る', '日本語', 'を'], ['["k1","v1","a1"]']])
  })

  test('answers a romaji or deinflected query with its primary entry’s examples, query words accented', async () => {
    const found = (await ask(
      listing('見る', 30),
      'resultsExamples',
      JSON.stringify({
        query: '見る',
        primaryEntry: 'v1',
        usesPrimaryEntryExamples: true,
        from: 25
      })
    )) as EmbeddedResultsExamples
    expect(found).toMatchObject({ listed: 30, countText: '30 examples' })
    expect(found.examples.map(example => example.id)).toEqual(
      Array.from({ length: 5 }, (_, row) => `esp1_${pairId(25 + row)}`)
    )
    expect(accents(found.examples[0].words)).toEqual([['見る', 'v1', 'query']])
  })

  test('answers a word’s examples a page at a time, with the word itself accented', async () => {
    const page = (id: string, from: number) =>
      ask(listing('見る', 30), 'entryExamples', JSON.stringify({ id, from }))
    const first = (await page('v1', 0)) as EmbeddedEntryExamples
    expect(first).toMatchObject({ listed: 30, count: 30, truncated: false })
    expect(first.examples).toHaveLength(25)
    expect(accents(first.examples[0].words)).toEqual([['見る', 'v1', 'entry']])
    expect(((await page('v1', 25)) as EmbeddedEntryExamples).examples).toHaveLength(5)
    await expect(page('missing', 0)).rejects.toThrow('missingEntryEvidence')
  })

  test('answers each meaning’s checked example, by meaning number, with the word accented', async () => {
    const dictionary = host()
    const checked = [
      { senseOrder: 0, rowid: 1, pairId: pairId(1), japanese: '見る', english: 'To see.' },
      { senseOrder: 0, rowid: 2, pairId: pairId(2), japanese: '今日見た', english: 'Saw it.' },
      { senseOrder: 2, rowid: 3, pairId: pairId(3), japanese: '日本語を見た', english: 'Saw.' }
    ]
    const target = {
      ...dictionary,
      all: (sql: string, parametersJSON: string) =>
        sql.includes('FROM sense_examples s')
          ? { rows: checked }
          : (dictionary.all?.(sql, parametersJSON) ?? null)
    }
    const found = (await ask(
      target,
      'meaningExamples',
      JSON.stringify({ id: 'v1' })
    )) as EmbeddedMeaningExample[]
    expect(found.map(({ number, example }) => [number, example.id, example.english])).toEqual([
      [1, `esp1_${pairId(1)}`, 'To see.'],
      [3, `esp1_${pairId(3)}`, 'Saw.']
    ])
    expect(accents(found[1].example.words)).toEqual([
      ['日本語', 'a1', null],
      ['を', null, null],
      ['見た', 'v1', 'entry']
    ])
    await expect(ask(target, 'meaningExamples', JSON.stringify({ id: 'missing' }))).rejects.toThrow(
      'missingEntryEvidence'
    )
  })

  test('answers a conjugated form’s examples, only where the form is one word, with it accented', async () => {
    const page = (form: string) =>
      ask(
        listing('日本語を見た', 3),
        'formExamples',
        JSON.stringify({ form, from: 0 })
      ) as Promise<EmbeddedExamplePage>

    const saw = await page('見た')
    expect(saw.listed).toBe(3)
    expect(saw.examples.map(example => accents(example.words))).toEqual(
      Array.from({ length: 3 }, () => [
        ['日本語', 'a1', null],
        ['を', null, null],
        ['見た', 'v1', 'query']
      ])
    )
    expect(await page('本語')).toEqual({ examples: [], listed: 0, cutShort: false })
  })

  test('remembers the sentences a form is one word in, and analyzes again a list it could not read', async () => {
    const tokenized: string[] = []
    let unreadable = '今日見た'
    const target = {
      ...listing(['日本語を見た', '今日見た'], 2),
      tokenize: (text: string) => {
        tokenized.push(text)
        if (text === unreadable) throw new Error(`The tokenizer can't read ${text} yet`)
        return sentences[text]
      }
    }
    const endpoint = embeddedEndpoint(target)
    const using = async (form: string) => {
      const { value } = await settled(
        endpoint.begin('formExamples', JSON.stringify({ form, from: 0 }))
      )
      return (value as EmbeddedExamplePage).examples.map(example => example.japanese)
    }

    expect(await using('見た')).toEqual(['日本語を見た'])
    unreadable = ''
    expect(await using('見た')).toEqual(['今日見た', '日本語を見た'])
    const read = tokenized.length
    expect(await using('見た')).toEqual(['今日見た', '日本語を見た'])
    expect(tokenized.slice(read)).toEqual([])
  })

  test('refuses an example index that is not the one the core reads', async () => {
    await expect(ask(host(), 'checkExamples', '')).rejects.toThrow(
      'Refusing the language data: its retrieval_index_schema_version is undefined'
    )
  })

  test('shows the text unlinked when the host cannot analyze it either', async () => {
    const call = begin(
      fakeHost(entries),
      'linkedTokens',
      JSON.stringify({ text: '日本語', query: '', highlightedEntry: null })
    )
    await settled(call)
    call.analyzed('{"error":"This host has no analyzer"}')
    expect(await settled(call)).toMatchObject({ value: [{ surface: '日本語', entry: null }] })
  })
})
