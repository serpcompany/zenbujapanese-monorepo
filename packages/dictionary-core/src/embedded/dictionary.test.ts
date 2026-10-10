import { describe, expect, test } from 'vitest'
import {
  type EmbeddedCall,
  EmbeddedDictionary,
  type EmbeddedHost,
  embeddedEndpoint,
  hostDatabase
} from './dictionary'

interface FakeEntry {
  id: string
  headword: string
  reading: string
}

const entries: FakeEntry[] = [
  { id: 'b2', headword: '日本語', reading: 'にほんご' },
  { id: 'a1', headword: '日本', reading: 'にほん' },
  { id: 'c3', headword: '本日', reading: 'ほんじつ' }
]

function formRows(matches: (form: string) => boolean) {
  return entries.flatMap(entry =>
    [
      { form: entry.headword, kind: 0 },
      { form: entry.reading, kind: 1 }
    ]
      .filter(({ form }) => matches(form))
      .map(({ form, kind }) => ({
        id: entry.id,
        source_record_id: 1,
        headword: entry.headword,
        reading: entry.reading,
        summary: '',
        parts_of_speech_json: '["noun"]',
        semantic_fingerprint: entry.id,
        primary_mask: null,
        secondary_mask: null,
        news_frequency_band: null,
        form,
        kind,
        sense_count: 1
      }))
  )
}

function host(overrides: Partial<EmbeddedHost> = {}): EmbeddedHost & { asked: string[][] } {
  const asked: string[][] = []
  return {
    asked,
    all(sql, parametersJSON) {
      const parameters = JSON.parse(parametersJSON) as string[]
      asked.push(parameters)
      if (!sql.includes('FROM forms f') || !sql.includes('f.kind IN (0, 1)')) return { rows: [] }
      const matches = sql.includes('f.form = ?')
        ? (form: string) => form === parameters[0]
        : sql.includes('f.form IN')
          ? (form: string) => parameters.includes(form)
          : (form: string) => form.includes(parameters[0])
      return { rows: formRows(matches) }
    },
    ...overrides
  }
}

interface Outcome {
  value?: unknown
  error?: string
  analyze?: string
}

async function settled(call: EmbeddedCall): Promise<Outcome> {
  await new Promise(resolve => setTimeout(resolve))
  return JSON.parse(call.outcome()) as Outcome
}

function begin(target: EmbeddedHost, method: string, argument: string): EmbeddedCall {
  return embeddedEndpoint(new EmbeddedDictionary(target)).begin(method, argument)
}

async function ask(target: EmbeddedHost, method: string, argument: string): Promise<unknown> {
  const { value, error } = await settled(begin(target, method, argument))
  if (error !== undefined) throw new Error(error)
  return value
}

const word = (surface: string, partOfSpeech: string) => ({
  surface,
  dictionaryForm: surface,
  partOfSpeech: [partOfSpeech],
  isOutOfVocabulary: false
})

describe('the embedded dictionary', () => {
  test('answers a search with each entry, its place by relevance, and its match', async () => {
    const results = (await ask(host(), 'search', '日本')) as {
      items: { id: string; relevance: number; fallbackOrder: number; match: string }[]
      presentation: string
      resolution: string
    }
    expect(results.items).toEqual([
      {
        id: 'a1',
        relevance: 0,
        fallbackOrder: 0,
        matchedSummary: null,
        match: 'source=0 japanese writtenExact'
      },
      {
        id: 'b2',
        relevance: 1,
        fallbackOrder: 1,
        matchedSummary: null,
        match: 'source=0 japanese writtenPrefix'
      }
    ])
    expect(results.presentation).toBe('ranked')
    expect(results.resolution).toBe('direct')
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

  test('says so when asked for something it does not have', async () => {
    await expect(ask(host(), 'translate', '日本')).rejects.toThrow('The core has no translate')
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
    const endpoint = embeddedEndpoint(new EmbeddedDictionary(host()))
    const sentence = endpoint.begin('search', '日本と本日')
    await settled(sentence)
    const form = endpoint.begin('entriesMatchingFirstForms', '[["にほん"]]')
    expect(await settled(form)).toMatchObject({ value: { にほん: [{ id: 'a1' }] } })
    expect(JSON.parse(sentence.outcome())).toEqual({ analyze: '日本と本日' })
  })
})
