import type {
  ExamplesResponse,
  FormExamplesResponse,
  KanjiResponse,
  SearchExamplesResponse,
  SearchResponse,
  WordResponse
} from '@zenbu/dictionary-core/artifact/dictionary'
import type { FormExampleRows } from '@zenbu/dictionary-core/detail/rows'
import { fixtureKanjiRows, fixtureWordRows } from '@zenbu/dictionary-core/fixtures'
import { searchResultsScreen } from '@zenbu/dictionary-core/results/results'
import type {
  SearchEntry,
  SearchResultItem,
  SearchResults
} from '@zenbu/dictionary-core/search/search'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  getConjugationExamples,
  getKanjiDetails,
  getSearchExamples,
  getWordExamples,
  getWordPage,
  type SearchData,
  searchDictionary
} from './data'

const env: { DICTIONARY_API_URL?: string; DICTIONARY_API_TOKEN?: string } = {}
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: async () => ({ env }) }))

const token = 'test-token-0123456789'

function serve(answers: Record<string, unknown>) {
  env.DICTIONARY_API_URL = 'https://dictionary.test'
  env.DICTIONARY_API_TOKEN = token
  const requests: string[] = []
  const fetch = vi.fn(async (request: Request) => {
    expect(request.headers.get('authorization')).toBe(`Bearer ${token}`)
    const url = new URL(request.url)
    const path = decodeURIComponent(url.pathname) + url.search
    requests.push(path)
    const answer = answers[path]
    if (typeof answer === 'number') return new Response('{}', { status: answer })
    if (answer === undefined) return new Response('{"error":"not found"}', { status: 404 })
    return Response.json(answer, { headers: { 'X-Dictionary-Build': 'build-1' } })
  })
  vi.stubGlobal('fetch', fetch)
  return requests
}

afterEach(() => {
  delete env.DICTIONARY_API_URL
  delete env.DICTIONARY_API_TOKEN
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const taberuWithoutFixture = 1358280
const kanameNoun = 1609600

const eat: SearchResultItem = {
  entry: {
    id: '042e07f7052f611fed33ddddf37f55fd',
    sourceRecordId: 1358280,
    headword: '食べる',
    reading: 'たべる',
    summary: 'to eat',
    partsOfSpeech: ['v1', 'vt']
  },
  sourceOrder: 0,
  matchRank: {
    kind: 'english',
    lane: 0,
    corroborationRank: 0,
    romajiSpecificityRank: 0,
    senseOrder: 0,
    priorityPresenceRank: 0,
    relation: 0,
    priorityProfile: { primaryMask: 3, secondaryMask: 0, newsFrequencyBand: 2 },
    glossOrder: 0,
    headwordLength: 3,
    semanticFingerprint: 'eat'
  },
  fallbackOrder: 0,
  matchedSummary: 'to eat'
}

const iru: SearchEntry = {
  id: '0a1b',
  sourceRecordId: 1546640,
  headword: '要る',
  reading: 'いる',
  summary: 'to be needed',
  partsOfSpeech: ['v5r']
}

function results(entries: SearchEntry[]): SearchResults {
  return {
    items: entries.map((entry, position) => ({
      ...eat,
      entry,
      sourceOrder: position,
      fallbackOrder: position,
      matchedSummary: null
    })),
    leadingLexicalEntryCount: entries.length,
    presentation: 'ranked',
    resolution: 'direct',
    readingRefinement: null,
    usesPrimaryEntryExamples: false,
    hasExactOrPrefixMatch: true
  }
}

function searchAnswer(
  query: string,
  entries: SearchEntry[],
  { examples = 0 } = {}
): SearchResponse {
  return {
    screen: searchResultsScreen(query, results(entries), new Map(), examples),
    kanjiHasPage: false
  }
}

function rowsOf(data: SearchData) {
  if (data.state !== 'results') throw new Error(`no results for ${data.query}`)
  return data.rows
}

const iruRows = fixtureWordRows.find(rows => rows.entry.entSeq === 1546640)
const kanameRows = fixtureKanjiRows.find(rows => rows.kanji.character === '要')
if (!iruRows || !kanameRows) throw new Error('no fixtures for 要る and 要')

const kanjiAnswer: KanjiResponse = {
  rows: kanameRows,
  indexable: true,
  slugs: Object.fromEntries(kanameRows.words.map(row => [row.entSeq, row.headword])),
  kanjiPages: ['女']
}

const formRows = (surface: string, count: number): FormExampleRows[] =>
  iruRows.examples.slice(0, count).map(({ sentence, example }) => ({
    sentence,
    example: {
      surface,
      position: example.position,
      sentenceId: example.sentenceId,
      highlights: example.highlights,
      links: example.links
    }
  }))

describe('searchDictionary', () => {
  test('searches the dictionary service, and links every word to its page', async () => {
    const requests = serve({ '/v1/search/eat': searchAnswer('eat', [eat.entry, iru]) })
    const data = await searchDictionary('eat')
    expect(requests).toEqual(['/v1/search/eat'])
    expect(rowsOf(data).map(word => [word.entSeq, word.path])).toEqual([
      [1358280, '/dictionary/食べる-1358280/'],
      [1546640, '/dictionary/要る-1546640/']
    ])
    expect(data).toMatchObject({ kanji: null, readingRefinement: null, examples: null })
  })

  test('leads with the Example Sentences row: English lists them on the page, Japanese opens the top word’s', async () => {
    serve({
      '/v1/search/eat': searchAnswer('eat', [eat.entry], { examples: 51 }),
      '/v1/search/いる': searchAnswer('いる', [iru, eat.entry], { examples: 3 })
    })
    expect(await searchDictionary('eat')).toMatchObject({
      sections: ['examples', 'results'],
      examples: { count: 51, title: 'View 50+ Example Sentences', target: { kind: 'inline' } }
    })
    expect(await searchDictionary('いる')).toMatchObject({
      examples: { target: { kind: 'word', path: '/dictionary/要る-1546640/#examples' } }
    })
  })

  test('gives the kanji row the kanji’s details when the service has them', async () => {
    const requests = serve({
      '/v1/search/要': searchAnswer('要', [iru]),
      '/v1/kanji/要': kanjiAnswer,
      '/v1/search/㐂': searchAnswer('㐂', [])
    })
    const kaname = await searchDictionary('要')
    expect(kaname).toMatchObject({ kanji: { character: '要', label: 'KANJI' } })
    expect(kaname.state === 'results' && kaname.kanji?.details?.meanings[0]).toBe('need')
    expect(await searchDictionary('㐂')).toMatchObject({
      kanji: { character: '㐂', summary: 'Kanji detail', details: null },
      rows: []
    })
    expect(requests).toEqual(['/v1/search/要', '/v1/kanji/要', '/v1/search/㐂', '/v1/kanji/㐂'])
  })

  test('shows No Dictionary Matches when nothing matches', async () => {
    serve({ '/v1/search/qzxvkj': searchAnswer('qzxvkj', []) })
    expect(await searchDictionary('qzxvkj')).toEqual({ state: 'noResults', query: 'qzxvkj' })
  })

  test('searches the fixtures without a service, in the app’s order', async () => {
    const data = await searchDictionary('いる')
    expect(rowsOf(data).map(word => word.entSeq)).toEqual([
      1546640, 1577980, 1391500, 1465580, 1322180, 1587780
    ])
    const kaname = await searchDictionary('要')
    expect(kaname.state === 'results' && kaname.kanji?.details?.character).toBe('要')
  })

  test('fails when the service fails, rather than showing no results', async () => {
    serve({ '/v1/search/eat': 503 })
    await expect(searchDictionary('eat')).rejects.toThrow('answered 503')
  })

  test('finds nothing for a query past the service’s 200 characters, without asking it', async () => {
    const requests = serve({})
    const long = 'a'.repeat(201)
    expect(await searchDictionary(long)).toEqual({ state: 'noResults', query: long })
    expect(await getSearchExamples(long)).toBeNull()
    expect(await getConjugationExamples('た'.repeat(201))).toEqual([])
    expect(requests).toEqual([])
  })
})

describe('word pages and kanji details', () => {
  test('read the fixtures without a service', async () => {
    const page = await getWordPage(1546640)
    expect(page?.path).toBe('/dictionary/要る-1546640/')
    expect(page?.kanji[0].details?.words).toHaveLength(24)
    expect(await getWordPage(taberuWithoutFixture)).toBeNull()
    expect((await getKanjiDetails('要'))?.words).toHaveLength(24)
    expect(await getKanjiDetails('項')).toBeNull()
  })

  test('a word’s kanji carry their details, when the dictionary has them', async () => {
    const page = await getWordPage(1546750)
    expect(
      page?.kanji.map(kanji => [kanji.character, kanji.path, kanji.details?.character])
    ).toEqual([
      ['要', '/dictionary/search/%E8%A6%81/', '要'],
      ['項', null, undefined]
    ])
  })

  test('a word page reads the service and links by the slugs it names', async () => {
    const answer: WordResponse = {
      rows: {
        ...iruRows,
        entry: {
          ...iruRows.entry,
          relationships: [
            {
              headword: '居る',
              reading: 'いる',
              summary: 'to be',
              relation: 'See also',
              targetEntSeq: 1577980
            },
            {
              headword: '無い',
              reading: 'ない',
              summary: 'none',
              relation: 'Antonym',
              targetEntSeq: null
            }
          ]
        }
      },
      slug: '要る',
      slugs: { 1577980: 'いる', 1546640: '要る' },
      kanjiPages: ['要']
    }
    const requests = serve({ '/v1/words/1546640': answer, '/v1/kanji/要': kanjiAnswer })
    const page = await getWordPage(1546640)
    expect(requests).toEqual(['/v1/words/1546640', '/v1/kanji/要'])
    expect(page?.path).toBe('/dictionary/要る-1546640/')
    expect(page?.slug).toBe('要る')
    expect(page?.kanji).toEqual([
      {
        character: '要',
        meaning: 'need, main point',
        path: '/dictionary/search/%E8%A6%81/',
        details: expect.objectContaining({ character: '要' })
      }
    ])
    expect(page?.related.map(related => related.path)).toEqual(['/dictionary/いる-1577980/', null])
    const tokens = page?.examples.flatMap(example => example.tokens) ?? []
    expect(tokens.filter(token => token.isPageWord).map(token => token.path)).toContain(
      '/dictionary/要る-1546640/'
    )
    const choice = tokens.find(token => token.link && 'entSeqs' in token.link)
    expect(choice?.path).toMatch(/^\/dictionary\/search\//)
    expect(page?.examplesPath).toBe('/dictionary/examples/1546640.json?build=build-1')
  })

  test('a word page shows its first 25 examples, and the rest load 25 at a time', async () => {
    const page = await getWordPage(1546640)
    expect(page?.examples).toHaveLength(25)
    expect(page?.exampleCount?.listed).toBeGreaterThan(25)
    expect(page?.examplesPath).toBe('/dictionary/examples/1546640.json?build=fixtures')
    const more = await getWordExamples(1546640, 25, 'fixtures')
    expect(more?.map(example => example.position)).toEqual(
      Array.from({ length: more?.length ?? 0 }, (_, index) => 25 + index)
    )
    expect(await getWordExamples(taberuWithoutFixture, 25, 'fixtures')).toBeNull()
  })

  test('more examples come from the service, linked by its slugs', async () => {
    const answer: ExamplesResponse = {
      rows: iruRows.examples.slice(0, 2),
      slugs: { 1546640: '要る' }
    }
    const requests = serve({ '/v1/words/1546640/examples?from=25': answer })
    const more = await getWordExamples(1546640, 25, 'build-1')
    expect(requests).toEqual(['/v1/words/1546640/examples?from=25'])
    expect(more).toHaveLength(2)
    expect(more?.[0].tokens.find(token => token.isPageWord)?.path).toBe('/dictionary/要る-1546640/')
    expect(await getWordExamples(1, 25, 'build-1')).toBeNull()
  })

  test("a page from another build doesn't load this build's examples", async () => {
    serve({ '/v1/words/1546640/examples?from=25': { rows: [], slugs: {} } })
    expect(await getWordExamples(1546640, 25, 'build-0')).toBeNull()
    expect(await getWordExamples(1546640, 25, 'fixtures')).toBeNull()
  })

  test('a number the service lacks has no word page, even when a fixture has it', async () => {
    serve({})
    expect(await getWordPage(1546640)).toBeNull()
    expect(await getKanjiDetails('要')).toBeNull()
  })

  test('kanji details read the service, and link each kanji to its search', async () => {
    serve({ '/v1/kanji/要': kanjiAnswer })
    const details = await getKanjiDetails('要')
    expect(details?.words[2].path).toBe('/dictionary/要る-1546640/')
    expect(details?.elements.map(element => [element.character, element.path])).toEqual([
      ['女', '/dictionary/search/%E5%A5%B3/'],
      ['覀', null]
    ])
  })

  test('a failing service fails the request', async () => {
    serve({ '/v1/words/1546640': 500, '/v1/kanji/要': 500 })
    await expect(getWordPage(1546640)).rejects.toThrow('answered 500')
    await expect(getKanjiDetails('要')).rejects.toThrow('answered 500')
  })

  test('a word page whose kanji details fail still shows, with that kanji closed, and logs it', async () => {
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {})
    const answer: WordResponse = { rows: iruRows, slug: '要る', slugs: {}, kanjiPages: ['要'] }
    serve({ '/v1/words/1546640': answer, '/v1/kanji/要': 500 })
    const page = await getWordPage(1546640)
    expect(page?.kanji.map(kanji => [kanji.character, kanji.details])).toEqual([['要', null]])
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('"kanji_details_unavailable"'))
    logged.mockRestore()
  })

  test.each([
    'staging',
    'production'
  ])('%s fails without a service instead of showing fixtures', async site => {
    vi.stubEnv('SITE_ENV', site)
    await expect(getWordPage(1546640)).rejects.toThrow('DICTIONARY_API_URL isn’t set')
    await expect(getKanjiDetails('要')).rejects.toThrow('DICTIONARY_API_URL isn’t set')
    await expect(searchDictionary('いる')).rejects.toThrow('DICTIONARY_API_URL isn’t set')
  })
})

describe('example sentences', () => {
  const sentences = (): SearchExamplesResponse => ({
    query: 'eat',
    listed: 100,
    truncated: true,
    usesPrimaryEntryExamples: false,
    rows: iruRows.examples.slice(0, 2),
    slugs: { 1546640: '要る' }
  })

  test('a search’s examples read the service, and load more for the same build', async () => {
    serve({ '/v1/search/eat/examples?from=0': sentences() })
    const page = await getSearchExamples('eat')
    expect(page).toMatchObject({
      query: 'eat',
      listed: 100,
      truncated: true,
      examplesPath: '/dictionary/search/eat/examples.json?build=build-1'
    })
    expect(page?.examples).toHaveLength(2)
    expect(page?.examples[0].tokens.find(token => token.isPageWord)?.path).toBe(
      '/dictionary/要る-1546640/'
    )
  })

  test('a search’s examples from another build load no more', async () => {
    serve({ '/v1/search/eat/examples?from=25': sentences() })
    expect(await getSearchExamples('eat', 25, 'build-0')).toBeNull()
    expect(await getSearchExamples('eat', 25, 'build-1')).not.toBeNull()
  })

  test('a search without examples, or without a service, has none', async () => {
    expect(await getSearchExamples('eat')).toBeNull()
    serve({})
    expect(await getSearchExamples('qzxvkj')).toBeNull()
  })

  test('a conjugated form’s examples come from the service, all at once for its row', async () => {
    const answer: FormExamplesResponse = {
      rows: formRows('要ります', 1),
      listed: 1,
      slugs: { 1546640: '要る' }
    }
    const requests = serve({ '/v1/conjugations/要ります/examples?from=0&limit=100': answer })
    const examples = await getConjugationExamples('要ります')
    expect(requests).toEqual(['/v1/conjugations/要ります/examples?from=0&limit=100'])
    expect(examples).toHaveLength(1)
    expect(examples[0].tokens.find(token => token.isPageWord)?.path).toBe(
      '/dictionary/要る-1546640/'
    )
  })
})

describe('conjugations', () => {
  test('a word page carries its conjugation table, and a noun none', async () => {
    const page = await getWordPage(1546640)
    expect(page?.conjugations?.rows.Plain.map(row => row.surface).slice(0, 2)).toEqual([
      '要る',
      '要った'
    ])
    expect(page?.conjugations?.rows.Polite[1].surface).toBe('要りました')
    expect((await getWordPage(kanameNoun))?.conjugations).toBeNull()
  })

  test('a form’s examples come from the fixtures without a service, all at once', async () => {
    const examples = await getConjugationExamples('入る')
    expect(examples).toHaveLength(50)
    expect(examples.map(example => example.position)).toEqual(
      Array.from({ length: 50 }, (_, index) => index)
    )
    expect(examples[0].tokens.some(token => token.isPageWord)).toBe(true)
    expect(await getConjugationExamples('要れ')).toEqual([])
  })
})

describe('the dictionary service', () => {
  beforeEach(() => {
    env.DICTIONARY_API_URL = 'https://dictionary.test'
  })

  test('needs its token wherever it is named', async () => {
    await expect(getWordPage(1546640)).rejects.toThrow('DICTIONARY_API_TOKEN is not')
  })
})
