import type { IpadicFile } from './ipadic'
import type { Tokenize } from './morphology'

interface FixtureWord {
  surface: string
  left: number
  right: number
  cost: number
  features: string
}

interface FixtureClass {
  name: string
  alwaysInvoked: boolean
  grouped: boolean
  characters: string
  words: Omit<FixtureWord, 'surface'>[]
}

export interface FixtureDictionary {
  words: FixtureWord[]
  classes: FixtureClass[]
  connections: number[][]
}

export const tokenFields = [
  'word_type',
  'word_position',
  'surface_form',
  'pos',
  'pos_detail_1',
  'pos_detail_2',
  'pos_detail_3',
  'basic_form',
  'reading'
] as const

export type FoundTokens = (string | number | null)[][] | 'refused'

export function foundTokens(tokenize: Tokenize, text: string): FoundTokens {
  try {
    return tokenize(text).map(token => tokenFields.map(field => token[field] ?? null))
  } catch {
    return 'refused'
  }
}

export function sampleTexts(pieces: readonly string[], count: number, seed: number): string[] {
  let state = seed
  const random = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x80000000
  }
  return Array.from({ length: count }, () => {
    let text = ''
    for (let piece = 1 + Math.floor(random() * 8); piece > 0; piece--) {
      text += pieces[Math.floor(random() * pieces.length)]
    }
    return text
  })
}

export function sampleDigest(tokenize: Tokenize, texts: readonly string[]): string {
  let low = 0x811c9dc5
  let high = 0x9747b28c
  for (const text of texts) {
    const found = `${JSON.stringify(foundTokens(tokenize, text))}\n`
    for (let index = 0; index < found.length; index++) {
      const unit = found.charCodeAt(index)
      low = Math.imul(low ^ unit, 0x01000193)
      high = Math.imul(high ^ unit, 0x5bd1e995) ^ (high >>> 13)
    }
  }
  return [high, low].map(half => (half >>> 0).toString(16).padStart(8, '0')).join('')
}

const encoder = new TextEncoder()

function trie(keys: readonly string[]): { base: Int32Array; check: Int32Array } {
  const base: number[] = [1]
  const check: number[] = [0]
  const isFree = (cell: number) => cell >= check.length || check[cell] === -1
  const claim = (cell: number, parent: number) => {
    while (check.length <= cell) {
      base.push(0)
      check.push(-1)
    }
    check[cell] = parent
  }
  const place = (node: number, endings: { bytes: Uint8Array; value: number }[], depth: number) => {
    const codes = [...new Set(endings.map(({ bytes }) => bytes[depth] ?? 0))].sort((a, b) => a - b)
    let start = 1
    while (!codes.every(code => isFree(start + code))) start++
    base[node] = start
    for (const code of codes) claim(start + code, node)
    for (const code of codes) {
      const under = endings.filter(({ bytes }) => (bytes[depth] ?? 0) === code)
      if (code === 0) base[start] = -under[0].value - 1
      else place(start + code, under, depth + 1)
    }
  }
  place(
    0,
    keys.map((key, value) => ({ bytes: encoder.encode(key), value })),
    0
  )
  return { base: Int32Array.from(base), check: Int32Array.from(check) }
}

function wordFiles(words: readonly Omit<FixtureWord, 'surface'>[], lists: Map<number, number[]>) {
  const records = new DataView(new ArrayBuffer(words.length * 10))
  const text: number[] = []
  words.forEach((word, index) => {
    records.setInt16(index * 10, word.left, true)
    records.setInt16(index * 10 + 2, word.right, true)
    records.setInt16(index * 10 + 4, word.cost, true)
    records.setInt32(index * 10 + 6, text.length, true)
    text.push(...encoder.encode(word.features), 0)
  })
  const map = [lists.size]
  for (const [key, listed] of lists) map.push(key, listed.length, ...listed)
  map.push(0, 0, 0, 0)
  return {
    records: records.buffer,
    text: Uint8Array.from(text).buffer,
    map: Int32Array.from(map).buffer
  }
}

export function fixtureFiles(dictionary: FixtureDictionary): Record<IpadicFile, ArrayBuffer> {
  const surfaces = [...new Set(dictionary.words.map(word => word.surface))].sort()
  const { base, check } = trie(surfaces)
  const known = new Map<number, number[]>()
  dictionary.words.forEach((word, index) => {
    const key = surfaces.indexOf(word.surface)
    known.set(key, [...(known.get(key) ?? []), index * 10])
  })
  const tid = wordFiles(
    dictionary.words.map(word => ({ ...word, features: `${word.surface},${word.features}` })),
    new Map([...known].sort(([left], [right]) => left - right))
  )
  const unknownWords = dictionary.classes.flatMap(({ words }) => words)
  const unknown = new Map<number, number[]>()
  let listed = 0
  dictionary.classes.forEach((kind, id) => {
    unknown.set(
      id,
      kind.words.map(() => listed++ * 10)
    )
  })
  const unk = wordFiles(unknownWords, unknown)
  const categories = new Uint8Array(0x10000).fill(
    dictionary.classes.findIndex(({ name }) => name === 'DEFAULT')
  )
  const definitions: number[] = []
  dictionary.classes.forEach((kind, id) => {
    for (const character of kind.characters) categories[character.charCodeAt(0)] = id
    definitions.push(Number(kind.alwaysInvoked), Number(kind.grouped), 0, 0, 0, 0)
    definitions.push(...encoder.encode(kind.name), 0)
  })
  const across = dictionary.connections[0].length
  return {
    base: base.buffer as ArrayBuffer,
    check: check.buffer as ArrayBuffer,
    tid: tid.records,
    tid_pos: tid.text,
    tid_map: tid.map,
    cc: Int16Array.from([dictionary.connections.length, across, ...dictionary.connections.flat()])
      .buffer,
    unk: unk.records,
    unk_pos: unk.text,
    unk_map: unk.map,
    unk_char: categories.buffer,
    unk_invoke: Uint8Array.from(definitions).buffer
  }
}

const noun = '名詞,一般,*,*,*,*'

export const fixtureDictionary: FixtureDictionary = {
  words: [
    { surface: '東', left: 1, right: 1, cost: 600, features: `${noun},東,ヒガシ,ヒガシ` },
    {
      surface: '東京',
      left: 1,
      right: 1,
      cost: 300,
      features: `${noun},東京,トウキョウ,トーキョー`
    },
    { surface: '京都', left: 1, right: 1, cost: 300, features: `${noun},京都,キョウト,キョート` },
    { surface: '都', left: 2, right: 2, cost: 200, features: '名詞,接尾,地域,*,*,*,都,ト,ト' },
    { surface: '都', left: 1, right: 1, cost: 700, features: `${noun},都,ミヤコ,ミヤコ` },
    { surface: 'に', left: 3, right: 3, cost: 100, features: '助詞,格助詞,一般,*,*,*,に,ニ,ニ' },
    {
      surface: '行く',
      left: 4,
      right: 4,
      cost: 400,
      features: '動詞,自立,*,*,五段・カ行促音便,基本形,行く,イク,イク'
    },
    { surface: '行', left: 1, right: 1, cost: 900, features: `${noun},行,ギョウ,ギョー` },
    { surface: '。', left: 5, right: 5, cost: 50, features: '記号,句点,*,*,*,*,。,。,。' },
    { surface: '、', left: 5, right: 5, cost: 50, features: '記号,読点,*,*,*,*,、,、,、' },
    { surface: '都。', left: 2, right: 5, cost: 10, features: '名詞,接尾,地域,*,*,*,都。' },
    { surface: 'ね', left: 3, right: 3, cost: 100, features: '助詞,終助詞,*,*,*,*,ね,ネ,ネ' },
    { surface: 'ねこ', left: 1, right: 1, cost: 250, features: `${noun},ねこ,ネコ,ネコ` },
    { surface: '5', left: 6, right: 6, cost: 400, features: '名詞,数,*,*,*,*,5,ゴ,ゴ' }
  ],
  classes: [
    {
      name: 'DEFAULT',
      alwaysInvoked: false,
      grouped: true,
      characters: '',
      words: [{ left: 7, right: 7, cost: 3000, features: 'DEFAULT,記号,一般,*,*,*,*,*' }]
    },
    {
      name: 'KANJI',
      alwaysInvoked: false,
      grouped: false,
      characters: '東京都行猫犬',
      words: [{ left: 1, right: 1, cost: 2000, features: 'KANJI,名詞,一般,*,*,*,*,*' }]
    },
    {
      name: 'HIRAGANA',
      alwaysInvoked: false,
      grouped: true,
      characters: 'あいうえおかきくけこにねのはをが',
      words: [{ left: 1, right: 1, cost: 2500, features: 'HIRAGANA,名詞,一般,*,*,*,*,*' }]
    },
    {
      name: 'ALPHA',
      alwaysInvoked: true,
      grouped: true,
      characters: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
      words: [
        { left: 1, right: 1, cost: 1500, features: 'ALPHA,名詞,固有名詞,組織,*,*,*,*' },
        { left: 1, right: 1, cost: 1500, features: 'ALPHA,名詞,一般,*,*,*,*,*' }
      ]
    },
    {
      name: 'NUMERIC',
      alwaysInvoked: true,
      grouped: true,
      characters: '0123456789',
      words: [{ left: 6, right: 6, cost: 300, features: 'NUMERIC,名詞,数,*,*,*,*,*' }]
    },
    {
      name: 'SYMBOL',
      alwaysInvoked: true,
      grouped: true,
      characters: '!?。、「」',
      words: [{ left: 5, right: 5, cost: 1000, features: 'SYMBOL,記号,一般,*,*,*,*,*' }]
    },
    { name: 'SPACE', alwaysInvoked: false, grouped: true, characters: ' ', words: [] }
  ],
  connections: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 100, -300, -200, 50, 0, 200, 500],
    [0, 300, 400, -100, 100, -50, 200, 500],
    [0, 100, 200, 300, -250, 0, 200, 500],
    [0, 150, 200, 100, 300, -100, 200, 500],
    [0, 0, 0, 0, 0, 0, 0, 500],
    [0, 200, -100, 0, 200, 0, -200, 500],
    [0, 500, 500, 500, 500, 500, 500, 100]
  ]
}
