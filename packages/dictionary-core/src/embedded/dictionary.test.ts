import { describe, expect, test } from 'vitest'
import { embeddedEndpoint } from './dictionary'
import { ask, begin, type FakeEntry, fakeHost, settled } from './fake-host'
import { hostDatabase } from './host'

const entries: FakeEntry[] = [
  { id: 'b2', headword: '日本語', reading: 'にほんご' },
  { id: 'a1', entSeq: 1582710, headword: '日本', reading: 'にほん' },
  { id: 'c3', headword: '本日', reading: 'ほんじつ' }
]

const host = (overrides: Parameters<typeof fakeHost>[1] = {}) => fakeHost(entries, overrides)

const word = (surface: string, partOfSpeech: string) => ({
  surface,
  dictionaryForm: surface,
  partOfSpeech: [partOfSpeech],
  isOutOfVocabulary: false
})

describe('the embedded dictionary', () => {
  test('answers a search with each entry as a row, its place by relevance, and its match', async () => {
    expect(await ask(host(), 'search', '日本')).toEqual({
      items: [
        {
          id: 'a1',
          entSeq: 1,
          headword: '日本',
          reading: 'にほん',
          entrySummary: '日本 summary',
          matchedSummary: null,
          relevance: 0,
          fallbackOrder: 0,
          match: 'source=0 japanese writtenExact'
        },
        {
          id: 'b2',
          entSeq: 1,
          headword: '日本語',
          reading: 'にほんご',
          entrySummary: '日本語 summary',
          matchedSummary: null,
          relevance: 1,
          fallbackOrder: 1,
          match: 'source=0 japanese writtenPrefix'
        }
      ],
      presentation: 'ranked',
      readingRefinement: null,
      usesPrimaryEntryExamples: false,
      leadingLexicalEntryCount: 1,
      resolution: 'direct',
      primaryEntry: 'a1'
    })
  })

  test('names the first result as the primary entry when none is written as the query', async () => {
    expect(await ask(host(), 'search', '本')).toMatchObject({ primaryEntry: 'c3' })
    const nothing = begin(host(), 'search', 'ぞぞぞ')
    await settled(nothing)
    nothing.analyzed('{"words":[]}')
    expect(await settled(nothing)).toMatchObject({ value: { items: [], primaryEntry: null } })
  })

  test('answers an English query that finds nothing without waiting for an analysis', async () => {
    expect(await ask(host(), 'search', 'zzz yyy')).toMatchObject({ items: [], primaryEntry: null })
  })

  test('gives entries that match equally the same relevance', async () => {
    const results = (await ask(host(), 'search', '本')) as {
      items: { id: string; relevance: number }[]
    }
    expect(results.items.map(item => [item.id, item.relevance])).toEqual([
      ['c3', 0],
      ['a1', 1],
      ['b2', 1]
    ])
  })

  test('finds, for each word, the entries of the first of its forms that has any', async () => {
    const target = host()
    const alternatives = [[' にほん ', '日本'], ['ほん', '  ', '本日', '日本語'], ['ホン'], []]
    const noun = (id: string, reading: string) => [{ id, reading, partsOfSpeech: ['noun'] }]
    expect(await ask(target, 'entriesMatchingFirstForms', JSON.stringify(alternatives))).toEqual({
      ' にほん ': noun('a1', 'にほん'),
      ほん: [],
      ホン: [],
      '  ': [],
      本日: noun('c3', 'ほんじつ')
    })
    expect(target.asked).toEqual([['にほん', 'ほん', 'ホン'], ['本日']])
  })

  test('routes a website link to its word, or to what the link falls back to', async () => {
    const route = (path: string, linkHost = 'zenbujapanese.com') =>
      ask(host(), 'websiteRoute', JSON.stringify({ host: linkHost, path }))
    expect(await route('/dictionary/日本-1582710/')).toEqual({ kind: 'word', id: 'a1' })
    expect(await route('/dictionary/日本-999/')).toEqual({ kind: 'search', query: '日本' })
    expect(await route('/dictionary/999/')).toEqual({ kind: 'home' })
    expect(await route('/dictionary/search/iru/')).toEqual({ kind: 'search', query: 'iru' })
    expect(await route('/dictionary/kanji/本/')).toEqual({ kind: 'kanji', character: '本' })
    expect(await route('/dictionary/日本-1582710/', 'example.com')).toEqual({ kind: 'home' })
  })

  test('opens a related word by its entry, or by searching for how it is written', async () => {
    const related = (word: object) => ask(host(), 'relatedWord', JSON.stringify(word))
    const written = { query: '日本', headword: '日本語', reading: 'にほんご' }
    expect(await related({ ...written, targetID: 'zz' })).toBe('zz')
    expect(await related({ ...written, targetID: null })).toBe('b2')
    expect(await related({ ...written, targetID: null, reading: 'にっぽんご' })).toBe('a1')
    const unfound = begin(
      host(),
      'relatedWord',
      JSON.stringify({ ...written, targetID: null, query: '猫' })
    )
    expect(await settled(unfound)).toEqual({ analyze: '猫' })
    unfound.analyzed(JSON.stringify({ words: [] }))
    expect(await settled(unfound)).toEqual({ value: null })
  })

  test('opens a saved word by its entry, or by one written and read the same', async () => {
    const saved = (word: object) => ask(host(), 'savedWord', JSON.stringify(word))
    expect(await saved({ id: 'c3', headword: '消えた', reading: 'きえた' })).toBe('c3')
    expect(await saved({ id: 'gone', headword: '日本語', reading: 'にほんご' })).toBe('b2')
    expect(await saved({ id: 'gone', headword: '日本語', reading: 'にっぽんご' })).toBeNull()
  })

  test('keeps the handwriting candidates written in Japanese, and tells one kanji from text', async () => {
    expect(
      await ask(host(), 'japaneseCandidates', JSON.stringify(['見る', 'miru', 'ﾐﾙ', '見る']))
    ).toEqual(['見る', 'ミル'])
    expect(await ask(host(), 'isKanji', '見')).toBe(true)
    expect(await ask(host(), 'isKanji', '見る')).toBe(false)
    expect(await ask(host(), 'isKanji', 'み')).toBe(false)
  })

  test('writes a reading, and a sentence’s words, in romaji', async () => {
    expect(await ask(host(), 'romaji', 'にほんご')).toBe('nihongo')
    expect(await ask(host(), 'romaji', '日本語')).toBeNull()
    expect(
      await ask(
        host(),
        'sentenceRomaji',
        JSON.stringify([
          { surface: '日本語', reading: 'ニホンゴ' },
          { surface: 'を', reading: 'ヲ' },
          { surface: '。', reading: '。' }
        ])
      )
    ).toBe('nihongo wo。')
  })

  test('normalizes a query as search does', async () => {
    expect(await ask(host(), 'normalizeQuery', '  ＮＩＨＯＮ   go ')).toBe('nihon go')
  })

  test('binds what the core asks as JSON, and reads blob columns as bytes', () => {
    const db = hostDatabase({
      all: (_sql, parametersJSON) => ({
        rows: [{ echoed: parametersJSON, data: '00ff10' }],
        blobs: ['data']
      })
    })
    const rows = db.all<{ echoed: string; data: Uint8Array }>('SELECT 1', ['日本', 3, null])
    expect(rows[0].echoed).toBe('["日本",3,null]')
    expect([...rows[0].data]).toEqual([0, 255, 16])
  })

  test('says so when a host without a dictionary is asked to read one', async () => {
    await expect(ask({}, 'search', '日本')).rejects.toThrow('The host has no dictionary to read')
  })

  test("reports the host's own failure", async () => {
    const failing = host({ all: () => ({ error: 'The search was cancelled' }) })
    await expect(ask(failing, 'search', '日本')).rejects.toThrow('The search was cancelled')
    await expect(ask(host({ all: () => null }), 'search', '日本')).rejects.toThrow(
      'The host returned no rows'
    )
  })

  test('stops ranking as soon as the host says the search was abandoned', async () => {
    let asked = 0
    const abandoned = host({ interrupted: () => ++asked > 2 })
    await expect(ask(abandoned, 'search', '日本')).rejects.toThrow('The search was interrupted')
    expect(await ask(host({ interrupted: () => false }), 'search', '日本')).toMatchObject({
      items: [{ id: 'a1' }, { id: 'b2' }]
    })
  })

  test('checks at once that the word index is the one the core reads', () => {
    const version = (schema: string) =>
      host({ all: () => ({ rows: [{ key: 'artifact_schema', value: schema }] }) })
    const current = embeddedEndpoint(version('zenbu.example-word-index.v2'))
    expect(current.answer('checkWordIndex', '')).toBe(true)
    expect(() =>
      embeddedEndpoint(version('zenbu.example-word-index.v1')).answer('checkWordIndex', '')
    ).toThrow(
      'Refusing the language data: ExampleWordIndex.sqlite3 is zenbu.example-word-index.v1; the core reads zenbu.example-word-index.v2'
    )
  })

  test('says so when asked for something it does not have', async () => {
    await expect(ask(host(), 'translate', '日本')).rejects.toThrow('The core has no translate')
  })

  test('answers at once what needs no waiting, as a value or as JSON', () => {
    const endpoint = embeddedEndpoint(host())
    expect(endpoint.answer('isKanji', '見')).toBe(true)
    expect(endpoint.answer('romaji', 'にほんご')).toBe('nihongo')
    expect(endpoint.answer('romaji', '日本語')).toBeNull()
    expect(endpoint.answerJSON('japaneseCandidates', '["見る","miru"]')).toBe('["見る"]')
    expect(endpoint.answerJSON('gloss', '')).toBe('null')
    expect(endpoint.answerJSON('websiteRoute', '{"host":"example.com","path":"/"}')).toBe(
      JSON.stringify(endpoint.answer('websiteRoute', '{"host":"example.com","path":"/"}'))
    )
  })

  test('refuses to answer at once what has to wait, or what it does not have', () => {
    const endpoint = embeddedEndpoint(host())
    expect(() => endpoint.answer('search', '日本')).toThrow('search does not answer at once')
    expect(() => endpoint.answerJSON('translate', '日本')).toThrow('The core has no translate')
  })

  test('has an outcome only once a call has finished', () => {
    const call = begin(host(), 'search', '日本')
    expect(JSON.parse(call.outcome())).toEqual({ error: 'search did not finish within its call' })
  })

  test('asks the host for the words of a sentence, then searches each', async () => {
    const call = begin(host(), 'search', '日本と本日')
    expect(await settled(call)).toEqual({ analyze: '日本と本日' })
    call.analyzed(
      JSON.stringify({ words: [word('日本', '名詞'), word('と', '助詞'), word('本日', '名詞')] })
    )
    expect(await settled(call)).toMatchObject({
      value: {
        items: [{ id: 'a1' }, { id: 'c3' }],
        presentation: 'discoveredWords',
        resolution: 'analyzed'
      }
    })
  })

  test('finds nothing in a sentence the host cannot analyze', async () => {
    const call = begin(host(), 'search', '日本と本日')
    await settled(call)
    call.analyzed(JSON.stringify({ error: 'This host has no analyzer' }))
    expect(await settled(call)).toMatchObject({ value: { items: [] } })
    expect(() => call.analyzed('{"words":[]}')).toThrow('search is waiting for no analysis')
  })

  test('keeps each call’s outcome apart from the others', async () => {
    const endpoint = embeddedEndpoint(host())
    const sentence = endpoint.begin('search', '日本と本日')
    await settled(sentence)
    const form = endpoint.begin('entriesMatchingFirstForms', '[["にほん"]]')
    expect(await settled(form)).toMatchObject({ value: { にほん: [{ id: 'a1' }] } })
    expect(JSON.parse(sentence.outcome())).toEqual({ analyze: '日本と本日' })
  })
})
