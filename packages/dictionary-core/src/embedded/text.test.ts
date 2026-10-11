import { describe, expect, test } from 'vitest'
import { fixtureDictionary, fixtureFiles } from '../examples/ipadic.fixture'
import type { KuromojiToken } from '../examples/morphology'
import { embeddedEndpoint } from './dictionary'
import { ask, begin, type FakeEntry, fakeHost, settled } from './fake-host'
import type { EmbeddedToken } from './text'

const entries: FakeEntry[] = [
  { id: 'a1', headword: '日本語', reading: 'にほんご' },
  { id: 'p1', headword: 'を', reading: 'を', partsOfSpeech: ['particle'] },
  { id: 'p2', headword: 'を', reading: 'を', partsOfSpeech: ['particle'] },
  { id: 'n1', headword: 'を', reading: 'を', partsOfSpeech: ['noun'] },
  { id: 'v1', headword: '見る', reading: 'みる', partsOfSpeech: ['ichidanVerb'] },
  { id: 'x1', headword: '見た', reading: 'みた', partsOfSpeech: ['noun'] },
  { id: 'k1', headword: '今日', reading: 'きょう', readingForms: ['こんにち'] }
]

function token(
  position: number,
  surface: string,
  pos: string,
  reading: string,
  basicForm = surface
): KuromojiToken {
  return {
    word_type: 'KNOWN',
    word_position: position,
    surface_form: surface,
    pos,
    pos_detail_1: '*',
    pos_detail_2: '*',
    pos_detail_3: '*',
    basic_form: basicForm,
    reading
  }
}

const sentences: Record<string, KuromojiToken[]> = {
  日本語を見た: [
    token(1, '日本語', '名詞', 'ニホンゴ'),
    token(4, 'を', '助詞', 'ヲ'),
    token(5, '見', '動詞', 'ミ', '見る'),
    token(6, 'た', '助動詞', 'タ')
  ],
  今日: [token(1, '今日', '名詞', 'コンニチ')],
  '「日本語を」': [
    token(1, '「', '記号', '「'),
    token(2, '日本語', '名詞', 'ニホンゴ'),
    token(5, 'を', '助詞', 'ヲ'),
    token(6, '」', '記号', '」')
  ],
  欠けた分析: [token(1, '欠け', '動詞', 'カケ', '欠ける')]
}

const host = () =>
  fakeHost(entries, {
    tokenize: text => {
      if (!Object.hasOwn(sentences, text)) throw new Error(`Kuromoji has no ${text}`)
      return sentences[text]
    }
  })

const linked = (target: ReturnType<typeof host>, request: object) =>
  ask(target, 'linkedTokens', JSON.stringify(request)) as Promise<EmbeddedToken[]>

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
        isPageWord: false,
        matchesQuery: false,
        attaches: null,
        counted: true
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
        isPageWord: false,
        matchesQuery: false,
        attaches: null,
        counted: false
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
        isPageWord: false,
        matchesQuery: true,
        attaches: null,
        counted: true
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
    expect(tokens.map(found => [found.surface, found.entry, found.isPageWord])).toEqual([
      ['日本語', 'a1', false],
      ['を', null, false],
      ['見た', 'v1', true]
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

  test('shows a text Kuromoji cannot read, or does not cover, as one unlinked word', async () => {
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
        isPageWord: false,
        matchesQuery: false,
        attaches: null,
        counted: false
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

  test('asks the host for a text’s words when it has no Kuromoji of its own', async () => {
    const call = begin(
      fakeHost(entries),
      'linkedTokens',
      JSON.stringify({ text: '見た日本語', query: '', highlightedEntry: null })
    )
    expect(await settled(call)).toEqual({ analyze: '見た日本語' })
    const piece = (surface: string, dictionaryForm: string, partOfSpeech: string) => ({
      surface,
      dictionaryForm,
      normalizedForm: dictionaryForm,
      reading: surface,
      partOfSpeech: [partOfSpeech],
      isOutOfVocabulary: false
    })
    call.analyzed(
      JSON.stringify({
        words: [
          {
            ...piece('見た', '見た', '名詞'),
            children: [piece('見', '見る', '動詞'), piece('た', 'た', '助動詞')]
          },
          {
            surface: '日本語',
            dictionaryForm: '日本語',
            partOfSpeech: ['名詞'],
            isOutOfVocabulary: false
          }
        ]
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

  test('marks punctuation that stays with a neighbouring word, and counts only linked words', async () => {
    const found = await linked(host(), {
      text: '「日本語を」',
      query: '',
      highlightedEntry: null
    })
    expect(found.map(word => [word.surface, word.attaches, word.counted])).toEqual([
      ['「', 'next', false],
      ['日本語', null, true],
      ['を', null, false],
      ['」', 'previous', false]
    ])
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
