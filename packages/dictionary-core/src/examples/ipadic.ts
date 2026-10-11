import type { KuromojiToken, Tokenize } from './morphology'

const ipadicFiles = [
  'base',
  'check',
  'tid',
  'tid_map',
  'tid_pos',
  'cc',
  'unk',
  'unk_map',
  'unk_pos',
  'unk_char',
  'unk_invoke'
] as const

export type IpadicFile = (typeof ipadicFiles)[number]

export type ReadIpadicFile = (file: IpadicFile) => ArrayBuffer

const none = -1
const beginning = 0
const unreached = Number.MAX_VALUE
const rememberedFeatures = 50_000
const punctuation = /、|。/

function written(bytes: Uint8Array): string {
  let text = ''
  let at = 0
  while (at < bytes.length) {
    const first = bytes[at++]
    let code: number
    if (first < 0x80) {
      code = first
    } else if (first >> 5 === 0x06) {
      code = ((first & 0x1f) << 6) | (bytes[at++] & 0x3f)
    } else if (first >> 4 === 0x0e) {
      const second = bytes[at++]
      code = ((first & 0x0f) << 12) | ((second & 0x3f) << 6) | (bytes[at++] & 0x3f)
    } else {
      const second = bytes[at++]
      const third = bytes[at++]
      code =
        ((first & 0x07) << 18) |
        ((second & 0x3f) << 12) |
        ((third & 0x3f) << 6) |
        (bytes[at++] & 0x3f)
    }
    if (code < 0x10000) {
      text += String.fromCharCode(code)
    } else {
      code -= 0x10000
      text += String.fromCharCode(0xd800 | (code >> 10), 0xdc00 | (code & 0x3ff))
    }
  }
  return text
}

function writtenFrom(bytes: Uint8Array, start: number): string {
  const end = bytes.indexOf(0, start)
  return written(bytes.subarray(start, end < 0 ? bytes.length : end))
}

class Words {
  readonly shorts: Int16Array
  readonly lists: Int32Array
  private readonly records: DataView
  private readonly text: Uint8Array
  private readonly listOf: Int32Array
  private readonly features = new Map<number, string[]>()

  constructor(records: ArrayBuffer, text: ArrayBuffer, lists: ArrayBuffer) {
    this.shorts = new Int16Array(records, 0, records.byteLength >> 1)
    this.records = new DataView(records)
    this.text = new Uint8Array(text)
    this.lists = new Int32Array(lists, 0, lists.byteLength >> 2)
    const listed = this.lists[0] ?? 0
    let listOf = new Int32Array(Math.max(listed, 1))
    for (let at = 1, read = 0; read < listed; read++, at += 2 + this.lists[at + 1]) {
      const key = this.lists[at]
      if (key >= listOf.length) {
        const wider = new Int32Array(Math.max(key + 1, listOf.length * 2))
        wider.set(listOf)
        listOf = wider
      }
      if (listOf[key] !== 0) throw new Error(`The word lists name ${key} twice`)
      if (this.lists[at + 1] > 0) listOf[key] = at + 1
    }
    this.listOf = listOf
  }

  list(key: number): number {
    const list = this.listOf[key]
    if (!list) throw new TypeError(`No words are listed for ${key}`)
    return list
  }

  featuresOf(word: number): string[] {
    let features = this.features.get(word)
    if (features === undefined) {
      features = writtenFrom(this.text, this.records.getInt32(word + 6, true)).split(',')
      if (this.features.size >= rememberedFeatures) this.features.clear()
      this.features.set(word, features)
    }
    return features
  }
}

interface CharacterClasses {
  of: Uint8Array
  count: number
  alwaysInvoked: Uint8Array
  grouped: Uint8Array
  named: Int32Array
  fallback: number
}

function characterClasses(categories: ArrayBuffer, definitions: ArrayBuffer): CharacterClasses {
  const bytes = new Uint8Array(definitions)
  const names: string[] = []
  const invoked: number[] = []
  const grouped: number[] = []
  for (let at = 0; at + 1 < bytes.length; ) {
    invoked.push(bytes[at])
    grouped.push(bytes[at + 1])
    const end = bytes.indexOf(0, at + 6)
    names.push(written(bytes.subarray(at + 6, end < 0 ? bytes.length : end)))
    at = (end < 0 ? bytes.length : end) + 1
  }
  const fallback = names.indexOf('DEFAULT')
  const of = new Uint8Array(categories)
  if (fallback < 0 || of.length < 0x10000) {
    throw new Error('The character classes do not cover every character')
  }
  return {
    of,
    count: names.length,
    alwaysInvoked: Uint8Array.from(invoked),
    grouped: Uint8Array.from(grouped),
    named: Int32Array.from(names, name => names.indexOf(name)),
    fallback
  }
}

class Lattice {
  starts = new Int32Array(1024)
  lefts = new Int32Array(1024)
  rights = new Int32Array(1024)
  costs = new Int32Array(1024)
  words = new Int32Array(1024)
  spans = new Int32Array(1024)
  following = new Int32Array(1024)
  best = new Int32Array(1024)
  shortest = new Float64Array(1024)
  first = new Int32Array(0)
  last = new Int32Array(0)
  count = 0
  furthest = 0

  begin(positions: number): void {
    if (this.first.length < positions) {
      this.first = new Int32Array(positions * 2)
      this.last = new Int32Array(positions * 2)
    }
    this.first.fill(none, 0, positions)
    this.count = 0
    this.furthest = 0
    this.shortest[this.add(0, 0, none, 0, 0, 0, none)] = 0
  }

  add(
    position: number,
    start: number,
    word: number,
    left: number,
    right: number,
    cost: number,
    span: number
  ): number {
    const node = this.count++
    if (node === this.starts.length) this.widen()
    this.starts[node] = start
    this.words[node] = word
    this.lefts[node] = left
    this.rights[node] = right
    this.costs[node] = cost
    this.spans[node] = span
    this.best[node] = none
    this.shortest[node] = unreached
    this.following[node] = none
    if (this.first[position] === none) this.first[position] = node
    else this.following[this.last[position]] = node
    this.last[position] = node
    if (this.furthest < position) this.furthest = position
    return node
  }

  private widen(): void {
    const size = this.starts.length * 2
    const wider = (old: Int32Array) => {
      const array = new Int32Array(size)
      array.set(old)
      return array
    }
    this.starts = wider(this.starts)
    this.lefts = wider(this.lefts)
    this.rights = wider(this.rights)
    this.costs = wider(this.costs)
    this.words = wider(this.words)
    this.spans = wider(this.spans)
    this.following = wider(this.following)
    this.best = wider(this.best)
    const shortest = new Float64Array(size)
    shortest.set(this.shortest)
    this.shortest = shortest
  }
}

class Ipadic {
  private readonly base: Int32Array
  private readonly check: Int32Array
  private readonly known: Words
  private readonly unknown: Words
  private readonly connections: Int16Array
  private readonly classes: CharacterClasses
  private readonly lattice = new Lattice()
  private units = new Int32Array(0)
  private offsets = new Int32Array(0)
  private kinds = new Uint8Array(0)
  private ends = new Int32Array(0)
  private utf8 = new Uint8Array(0)
  private unitAt = new Int32Array(0)
  private bytes = 0

  constructor(read: ReadIpadicFile) {
    if (new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1) {
      throw new Error('The dictionary files are little-endian, and this machine is not')
    }
    const base = read('base')
    const check = read('check')
    const connections = read('cc')
    this.base = new Int32Array(base, 0, base.byteLength >> 2)
    this.check = new Int32Array(check, 0, check.byteLength >> 2)
    if (this.base.length !== this.check.length) {
      throw new Error('The word index and its check differ in size')
    }
    this.known = new Words(read('tid'), read('tid_pos'), read('tid_map'))
    this.unknown = new Words(read('unk'), read('unk_pos'), read('unk_map'))
    this.connections = new Int16Array(connections, 0, connections.byteLength >> 1)
    this.classes = characterClasses(read('unk_char'), read('unk_invoke'))
  }

  tokenize(text: string): KuromojiToken[] {
    const tokens: KuromojiToken[] = []
    let rest = text
    while (rest !== '') {
      const stop = rest.search(punctuation)
      this.sentence(stop < 0 ? rest : rest.substring(0, stop + 1), tokens)
      if (stop < 0) break
      rest = rest.substring(stop + 1)
    }
    return tokens
  }

  private sentence(text: string, tokens: KuromojiToken[]): void {
    const characters = this.read(text)
    const lattice = this.lattice
    lattice.begin(characters + text.length + 3)
    for (let character = 0; character < characters; character++) {
      this.unknownWords(character, this.knownWords(character))
    }
    const end = Math.max(1, lattice.furthest) + 1
    const last = lattice.add(lattice.furthest + 1, end, none, 0, 0, 0, none)
    this.search(end)
    this.shape(text, last, tokens)
  }

  private read(text: string): number {
    const length = text.length
    if (this.units.length <= length) {
      this.units = new Int32Array(length * 2 + 1)
      this.offsets = new Int32Array(length * 2 + 1)
      this.kinds = new Uint8Array(length * 2 + 1)
      this.ends = new Int32Array(length * 2 + 1)
      this.utf8 = new Uint8Array(length * 6 + 4)
      this.unitAt = new Int32Array(length * 6 + 5)
    }
    const { units, offsets, kinds } = this
    const utf8 = this.utf8
    const unitAt = this.unitAt
    const { of, fallback, named } = this.classes
    let characters = 0
    let bytes = 0
    for (let unit = 0; unit < length; characters++) {
      const code = text.charCodeAt(unit)
      units[characters] = unit
      offsets[characters] = bytes
      unitAt[bytes] = unit
      if (code >= 0xd800 && code <= 0xdbff) {
        const low = text.charCodeAt(unit + 1)
        if (!(low >= 0xdc00 && low <= 0xdfff)) {
          throw new TypeError('A high surrogate stands without its low surrogate')
        }
        const point = (code - 0xd800) * 0x400 + 0x10000 + (low - 0xdc00)
        utf8[bytes++] = (point >>> 18) | 0xf0
        utf8[bytes++] = ((point >> 12) & 0x3f) | 0x80
        utf8[bytes++] = ((point >> 6) & 0x3f) | 0x80
        utf8[bytes++] = (point & 0x3f) | 0x80
        kinds[characters] = fallback
        unit += 2
        continue
      }
      if (code < 0x80) {
        utf8[bytes++] = code
      } else if (code < 0x800) {
        utf8[bytes++] = (code >>> 6) | 0xc0
        utf8[bytes++] = (code & 0x3f) | 0x80
      } else {
        utf8[bytes++] = (code >>> 12) | 0xe0
        utf8[bytes++] = ((code >> 6) & 0x3f) | 0x80
        utf8[bytes++] = (code & 0x3f) | 0x80
      }
      kinds[characters] = of[code]
      unit++
    }
    units[characters] = length
    offsets[characters] = bytes
    unitAt[bytes] = length
    this.bytes = bytes
    const ends = this.ends
    for (let character = characters - 1; character >= 0; character--) {
      const continues =
        character + 1 < characters && named[kinds[character + 1]] === named[kinds[character]]
      ends[character] = continues ? ends[character + 1] : character + 1
    }
    return characters
  }

  private knownWords(character: number): number {
    const { base, check, lattice } = this
    const utf8 = this.utf8
    const unitAt = this.unitAt
    const { shorts, lists } = this.known
    const from = this.units[character]
    const limit = this.bytes
    let found = 0
    let parent = 0
    for (let at = this.offsets[character]; at < limit; at++) {
      const child = base[parent] + utf8[at]
      if (check[child] !== parent) break
      parent = child
      const terminal = base[child]
      if (check[terminal] !== child) continue
      const value = base[terminal]
      if (value > 0) throw new TypeError('A word in the index has no number')
      found++
      const list = this.known.list(-value - 1)
      const length = unitAt[at + 1] - from
      for (let listed = list + 1; listed <= list + lists[list]; listed++) {
        const word = lists[listed]
        const record = word >> 1
        lattice.add(
          character + length,
          character + 1,
          word,
          shorts[record],
          shorts[record + 1],
          shorts[record + 2],
          none
        )
      }
    }
    return found
  }

  private unknownWords(character: number, found: number): void {
    const { alwaysInvoked, grouped, count } = this.classes
    const kind = this.kinds[character]
    if (kind >= count) throw new TypeError(`No character class is numbered ${kind}`)
    if (found !== 0 && alwaysInvoked[kind] !== 1) return
    const units = this.units
    let end = character + 1
    let length = 1
    if (grouped[kind] === 1 && this.ends[character] > end) {
      end = this.ends[character]
      length = units[end] - units[character]
    }
    const { shorts, lists } = this.unknown
    const list = this.unknown.list(kind)
    for (let listed = list + 1; listed <= list + lists[list]; listed++) {
      const word = lists[listed]
      const record = word >> 1
      this.lattice.add(
        character + length,
        character + 1,
        word,
        shorts[record],
        shorts[record + 1],
        shorts[record + 2],
        end
      )
    }
  }

  private search(end: number): void {
    const { starts, lefts, rights, costs, following, best, shortest, first } = this.lattice
    const connections = this.connections
    const across = connections[1]
    let chosen = none
    for (let position = 1; position <= end; position++) {
      for (let node = first[position]; node !== none; node = following[node]) {
        let previous = first[starts[node] - 1]
        if (previous === none) continue
        const left = lefts[node] + 2
        const own = costs[node]
        let cost = unreached
        for (; previous !== none; previous = following[previous]) {
          const through = shortest[previous] + connections[rights[previous] * across + left] + own
          if (through < cost) {
            chosen = previous
            cost = through
          }
        }
        best[node] = chosen
        shortest[node] = cost
      }
    }
  }

  private shape(text: string, last: number, tokens: KuromojiToken[]): void {
    const { starts, words, spans, best } = this.lattice
    const path: number[] = []
    for (let node = best[last]; node !== beginning; node = best[node]) {
      if (node === none) return
      path.push(node)
    }
    const before = tokens.length > 0 ? tokens[tokens.length - 1].word_position : 0
    for (let step = path.length - 1; step >= 0; step--) {
      const node = path[step]
      const character = starts[node] - 1
      const isKnown = spans[node] === none
      const features = (isKnown ? this.known : this.unknown).featuresOf(words[node])
      tokens.push({
        word_type: isKnown ? 'KNOWN' : 'UNKNOWN',
        word_position: before + starts[node],
        surface_form: isKnown
          ? features[0]
          : text.slice(this.units[character], this.units[spans[node]]),
        pos: features[1],
        pos_detail_1: features[2],
        pos_detail_2: features[3],
        pos_detail_3: features[4],
        basic_form: features[7],
        reading: isKnown ? features[8] : undefined
      })
    }
  }
}

export function ipadicTokenizer(read: ReadIpadicFile): Tokenize {
  let dictionary: Ipadic | undefined
  return text => {
    dictionary ??= new Ipadic(read)
    return dictionary.tokenize(text)
  }
}
