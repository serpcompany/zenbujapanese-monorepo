// Ports what the app's English example search (ExampleSentenceClient.swift's `retrieveEnglish`)
// asks of SQLite's FTS4, which D1 doesn't have: the `simple` and `porter` tokenizers
// (fts3_tokenizer1.c and fts3_porter.c, byte for byte), a quoted phrase query with its prefix
// (`*`) and first-token (`^`) marks (fts3_expr.c's getNextString), the `offsets()` a phrase match
// reports, and the app's `phraseRange` over them. The search import checks the stemmer against
// SQLite's own on every word of the corpus (scripts/release-d1/search/build-examples.mts), and
// the example-search suite checks the whole search against the app.
//
// Everything works on UTF-8 bytes, as FTS4 does: a token's `term` is a string of one character
// per byte (so a long word truncated mid-character still compares as SQLite compares it), and
// offsets are byte offsets.

import { graphemes } from '../detail/text'

export interface Fts4Token {
  /** The token as the index stores it, one character per byte. */
  term: string
  /** Byte offsets of the token in the text. */
  start: number
  end: number
}

export interface Fts4QueryToken {
  term: string
  /** Followed by `*`: matches any term starting with it. */
  isPrefix: boolean
  /** Preceded by `^`: matches only the first token of the text. */
  isFirst: boolean
}

export type Fts4Tokenizer = 'simple' | 'porter'

const encoder = new TextEncoder()

const isDigit = (byte: number) => byte >= 0x30 && byte <= 0x39
const isUpper = (byte: number) => byte >= 0x41 && byte <= 0x5a
const isLower = (byte: number) => byte >= 0x61 && byte <= 0x7a
const lower = (byte: number) => (isUpper(byte) ? byte + 0x20 : byte)

/**
 * fts3_tokenizer1.c's `simpleDelim` with the default delimiters: ASCII other than letters and
 * digits, except NUL, which it never marks.
 */
const simpleDelimiter = (byte: number) =>
  byte > 0 && byte < 0x80 && !isDigit(byte) && !isUpper(byte) && !isLower(byte)

/** fts3_porter.c's `isDelim`: ASCII other than letters, digits, and `_`. */
const porterDelimiter = (byte: number) =>
  byte < 0x80 && !isDigit(byte) && !isUpper(byte) && !isLower(byte) && byte !== 0x5f

const byteString = (bytes: ArrayLike<number>) => String.fromCharCode(...Array.from(bytes))

/** fts3_porter.c's `copy_stemmer`: case-folded, and long words cut to their two ends. */
function copyStem(bytes: Uint8Array): string {
  const out = Array.from(bytes, lower)
  const limit = bytes.some(isDigit) ? 3 : 10
  if (out.length > limit * 2) return byteString([...out.slice(0, limit), ...out.slice(-limit)])
  return byteString(out)
}

// The Porter stemmer as fts3_porter.c writes it: on the word reversed, so `z[0]` is its last
// letter. Its helpers read past the end of the word as NUL (`undefined` here).
const consonantTypes = [
  0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 2, 1
]

function isConsonant(z: string, i: number): boolean {
  const x = z[i]
  if (x === undefined) return false
  const type = consonantTypes[x.charCodeAt(0) - 0x61]
  if (type < 2) return type === 1
  return z[i + 1] === undefined || isVowel(z, i + 1)
}

function isVowel(z: string, i: number): boolean {
  const x = z[i]
  if (x === undefined) return false
  const type = consonantTypes[x.charCodeAt(0) - 0x61]
  if (type < 2) return type === 0
  return isConsonant(z, i + 1)
}

/** The word's m (its count of vowel-consonant sequences) is over 0. */
function mGreaterThan0(z: string, i: number): boolean {
  while (isVowel(z, i)) i++
  if (z[i] === undefined) return false
  while (isConsonant(z, i)) i++
  return z[i] !== undefined
}

function mEquals1(z: string, i: number): boolean {
  while (isVowel(z, i)) i++
  if (z[i] === undefined) return false
  while (isConsonant(z, i)) i++
  if (z[i] === undefined) return false
  while (isVowel(z, i)) i++
  if (z[i] === undefined) return true
  while (isConsonant(z, i)) i++
  return z[i] === undefined
}

function mGreaterThan1(z: string, i: number): boolean {
  while (isVowel(z, i)) i++
  if (z[i] === undefined) return false
  while (isConsonant(z, i)) i++
  if (z[i] === undefined) return false
  while (isVowel(z, i)) i++
  if (z[i] === undefined) return false
  while (isConsonant(z, i)) i++
  return z[i] !== undefined
}

function hasVowel(z: string, i: number): boolean {
  while (isConsonant(z, i)) i++
  return z[i] !== undefined
}

const doubleConsonant = (z: string, i: number) => isConsonant(z, i) && z[i] === z[i + 1]

/** Ends consonant-vowel-consonant, the last not w, x, or y. */
const starOh = (z: string, i: number) =>
  isConsonant(z, i) &&
  z[i] !== 'w' &&
  z[i] !== 'x' &&
  z[i] !== 'y' &&
  isVowel(z, i + 1) &&
  isConsonant(z, i + 2)

type Condition = (z: string, i: number) => boolean

/** The reversed word being stemmed, from `i`. */
interface Word {
  z: string
  i: number
}

/**
 * `stem`: when the word ends in `from` (reversed), and `condition` holds for what precedes it,
 * replaces that ending with `to` (not reversed). True whenever the ending matches.
 */
function stem(word: Word, from: string, to: string, condition: Condition | null): boolean {
  if (!word.z.startsWith(from, word.i)) return false
  const rest = word.i + from.length
  if (condition && !condition(word.z, rest)) return true
  word.z = [...to].reverse().join('') + word.z.slice(rest)
  word.i = 0
  return true
}

/** fts3_porter.c's `porter_stemmer`. */
function porterStem(bytes: Uint8Array): string {
  if (bytes.length < 3 || bytes.length >= 21) return copyStem(bytes)
  if (!bytes.every(byte => isUpper(byte) || isLower(byte))) return copyStem(bytes)
  const word: Word = { z: byteString(Array.from(bytes, lower).reverse()), i: 0 }
  const at = (offset: number) => word.z[word.i + offset]

  // Step 1a
  if (at(0) === 's') {
    if (!stem(word, 'sess', 'ss', null) && !stem(word, 'sei', 'i', null)) {
      if (!stem(word, 'ss', 'ss', null)) word.i++
    }
  }

  // Step 1b
  const before = word.z.slice(word.i)
  if (stem(word, 'dee', 'ee', mGreaterThan0)) {
    // The work was all in the test.
  } else if (
    (stem(word, 'gni', '', hasVowel) || stem(word, 'de', '', hasVowel)) &&
    word.z.slice(word.i) !== before
  ) {
    if (stem(word, 'ta', 'ate', null) || stem(word, 'lb', 'ble', null)) {
      // The work was all in the test.
    } else if (stem(word, 'zi', 'ize', null)) {
      // The work was all in the test.
    } else if (doubleConsonant(word.z, word.i) && at(0) !== 'l' && at(0) !== 's' && at(0) !== 'z') {
      word.i++
    } else if (mEquals1(word.z, word.i) && starOh(word.z, word.i)) {
      word.z = `e${word.z.slice(word.i)}`
      word.i = 0
    }
  }

  // Step 1c
  if (at(0) === 'y' && hasVowel(word.z, word.i + 1)) {
    word.z = `i${word.z.slice(word.i + 1)}`
    word.i = 0
  }

  // Step 2
  switch (at(1)) {
    case 'a':
      if (!stem(word, 'lanoita', 'ate', mGreaterThan0)) stem(word, 'lanoit', 'tion', mGreaterThan0)
      break
    case 'c':
      if (!stem(word, 'icne', 'ence', mGreaterThan0)) stem(word, 'icna', 'ance', mGreaterThan0)
      break
    case 'e':
      stem(word, 'rezi', 'ize', mGreaterThan0)
      break
    case 'g':
      stem(word, 'igol', 'log', mGreaterThan0)
      break
    case 'l':
      if (
        !stem(word, 'ilb', 'ble', mGreaterThan0) &&
        !stem(word, 'illa', 'al', mGreaterThan0) &&
        !stem(word, 'iltne', 'ent', mGreaterThan0) &&
        !stem(word, 'ile', 'e', mGreaterThan0)
      ) {
        stem(word, 'ilsuo', 'ous', mGreaterThan0)
      }
      break
    case 'o':
      if (
        !stem(word, 'noitazi', 'ize', mGreaterThan0) &&
        !stem(word, 'noita', 'ate', mGreaterThan0)
      ) {
        stem(word, 'rota', 'ate', mGreaterThan0)
      }
      break
    case 's':
      if (
        !stem(word, 'msila', 'al', mGreaterThan0) &&
        !stem(word, 'ssenevi', 'ive', mGreaterThan0) &&
        !stem(word, 'ssenluf', 'ful', mGreaterThan0)
      ) {
        stem(word, 'ssensuo', 'ous', mGreaterThan0)
      }
      break
    case 't':
      if (!stem(word, 'itila', 'al', mGreaterThan0) && !stem(word, 'itivi', 'ive', mGreaterThan0)) {
        stem(word, 'itilib', 'ble', mGreaterThan0)
      }
      break
  }

  // Step 3
  switch (at(0)) {
    case 'e':
      if (!stem(word, 'etaci', 'ic', mGreaterThan0) && !stem(word, 'evita', '', mGreaterThan0)) {
        stem(word, 'ezila', 'al', mGreaterThan0)
      }
      break
    case 'i':
      stem(word, 'itici', 'ic', mGreaterThan0)
      break
    case 'l':
      if (!stem(word, 'laci', 'ic', mGreaterThan0)) stem(word, 'luf', '', mGreaterThan0)
      break
    case 's':
      stem(word, 'ssen', '', mGreaterThan0)
      break
  }

  // Step 4
  const z = () => word.z
  switch (at(1)) {
    case 'a':
      if (at(0) === 'l' && mGreaterThan1(z(), word.i + 2)) word.i += 2
      break
    case 'c':
      if (
        at(0) === 'e' &&
        at(2) === 'n' &&
        (at(3) === 'a' || at(3) === 'e') &&
        mGreaterThan1(z(), word.i + 4)
      ) {
        word.i += 4
      }
      break
    case 'e':
      if (at(0) === 'r' && mGreaterThan1(z(), word.i + 2)) word.i += 2
      break
    case 'i':
      if (at(0) === 'c' && mGreaterThan1(z(), word.i + 2)) word.i += 2
      break
    case 'l':
      if (
        at(0) === 'e' &&
        at(2) === 'b' &&
        (at(3) === 'a' || at(3) === 'i') &&
        mGreaterThan1(z(), word.i + 4)
      ) {
        word.i += 4
      }
      break
    case 'n':
      if (at(0) === 't') {
        if (at(2) === 'a') {
          if (mGreaterThan1(z(), word.i + 3)) word.i += 3
        } else if (at(2) === 'e') {
          if (!stem(word, 'tneme', '', mGreaterThan1) && !stem(word, 'tnem', '', mGreaterThan1)) {
            stem(word, 'tne', '', mGreaterThan1)
          }
        }
      }
      break
    case 'o':
      if (at(0) === 'u') {
        if (mGreaterThan1(z(), word.i + 2)) word.i += 2
      } else if (at(3) === 's' || at(3) === 't') {
        stem(word, 'noi', '', mGreaterThan1)
      }
      break
    case 's':
      if (at(0) === 'm' && at(2) === 'i' && mGreaterThan1(z(), word.i + 3)) word.i += 3
      break
    case 't':
      if (!stem(word, 'eta', '', mGreaterThan1)) stem(word, 'iti', '', mGreaterThan1)
      break
    case 'u':
      if (at(0) === 's' && at(2) === 'o' && mGreaterThan1(z(), word.i + 3)) word.i += 3
      break
    case 'v':
    case 'z':
      if (at(0) === 'e' && at(2) === 'i' && mGreaterThan1(z(), word.i + 3)) word.i += 3
      break
  }

  // Step 5a
  if (at(0) === 'e') {
    if (mGreaterThan1(z(), word.i + 1)) word.i++
    else if (mEquals1(z(), word.i + 1) && !starOh(z(), word.i + 1)) word.i++
  }

  // Step 5b
  if (mGreaterThan1(z(), word.i) && at(0) === 'l' && at(1) === 'l') word.i++

  return [...word.z.slice(word.i)].reverse().join('')
}

/** A tokenizer's tokens of `text`, with their byte offsets. */
export function tokenize(text: string, tokenizer: Fts4Tokenizer): Fts4Token[] {
  const bytes = encoder.encode(text)
  const delimiter = tokenizer === 'porter' ? porterDelimiter : simpleDelimiter
  const tokens: Fts4Token[] = []
  let offset = 0
  while (offset < bytes.length) {
    while (offset < bytes.length && delimiter(bytes[offset])) offset++
    const start = offset
    while (offset < bytes.length && !delimiter(bytes[offset])) offset++
    if (offset > start) {
      const token = bytes.subarray(start, offset)
      tokens.push({
        term: tokenizer === 'porter' ? porterStem(token) : byteString(Array.from(token, lower)),
        start,
        end: offset
      })
    }
  }
  return tokens
}

/** The tokens of a quoted phrase query `"<phrase>"`, as fts3_expr.c's getNextString reads them. */
export function phraseQuery(phrase: string, tokenizer: Fts4Tokenizer): Fts4QueryToken[] {
  const bytes = encoder.encode(phrase)
  return tokenize(phrase, tokenizer).map(token => ({
    term: token.term,
    isPrefix: token.end < bytes.length && bytes[token.end] === 0x2a,
    isFirst: token.start > 0 && bytes[token.start - 1] === 0x5e
  }))
}

/** One entry of FTS4's `offsets()`: a phrase term, and the token it matched. */
export interface Fts4Offset {
  term: number
  byteOffset: number
  byteLength: number
}

const matchesTerm = (query: Fts4QueryToken, token: Fts4Token, position: number) =>
  (query.isPrefix ? token.term.startsWith(query.term) : token.term === query.term) &&
  (!query.isFirst || position === 0)

/**
 * What `offsets()` reports for a phrase query on a text: every token inside a match of the
 * phrase, once per phrase term it stands for. Empty when the phrase doesn't match.
 */
export function phraseOffsets(query: Fts4QueryToken[], tokens: Fts4Token[]): Fts4Offset[] {
  if (query.length === 0) return []
  const offsets = new Map<string, Fts4Offset>()
  for (let start = 0; start + query.length <= tokens.length; start++) {
    if (!query.every((term, index) => matchesTerm(term, tokens[start + index], start + index))) {
      continue
    }
    for (const [term] of query.entries()) {
      const token = tokens[start + term]
      offsets.set(`${term}:${start + term}`, {
        term,
        byteOffset: token.start,
        byteLength: token.end - token.start
      })
    }
  }
  return [...offsets.values()]
}

/** A match's place in its text, in grapheme clusters as Swift counts `Character`s. */
export interface MatchedRange {
  location: number
  length: number
}

/** The grapheme clusters of a text with the byte offset each starts at, and the text's end. */
function graphemeBoundaries(text: string): Pick<Map<number, number>, 'get'> {
  // Every ASCII character but CR before LF is its own grapheme and byte.
  if (/^[\0-\x7f]*$/.test(text) && !text.includes('\r\n')) {
    return { get: offset => (offset >= 0 && offset <= text.length ? offset : undefined) }
  }
  const boundaries = new Map<number, number>()
  let offset = 0
  const clusters = graphemes(text)
  for (const [index, cluster] of clusters.entries()) {
    boundaries.set(offset, index)
    offset += encoder.encode(cluster).length
  }
  boundaries.set(offset, clusters.length)
  return boundaries
}

/**
 * The app's `phraseRange(in:offsets:)`: the first run of offsets, in text order, that holds the
 * phrase's terms in order without crossing the end of a sentence (`.`, `?`, or `!` then a space),
 * as a grapheme range. Null when there is none, or it doesn't start and end on graphemes.
 */
export function phraseRange(text: string, offsets: Fts4Offset[]): MatchedRange | null {
  if (offsets.length === 0) return null
  const termCount = Math.max(...offsets.map(offset => offset.term)) + 1
  const ordered = [...offsets].sort((left, right) =>
    left.byteOffset === right.byteOffset
      ? left.term - right.term
      : left.byteOffset - right.byteOffset
  )
  const bytes = encoder.encode(text)
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let boundaries: Pick<Map<number, number>, 'get'> | null = null
  for (const [startIndex, first] of ordered.entries()) {
    if (first.term !== 0) continue
    const phrase = ordered.slice(startIndex, startIndex + termCount)
    if (phrase.length < termCount || phrase.some((offset, index) => offset.term !== index)) {
      continue
    }
    let crossesSentence = false
    for (let index = 0; index + 1 < phrase.length; index++) {
      const from = phrase[index].byteOffset + phrase[index].byteLength
      const to = phrase[index + 1].byteOffset
      let gap: string | null = null
      if (to >= from && to <= bytes.length) {
        try {
          gap = decoder.decode(bytes.subarray(from, to))
        } catch {
          gap = null
        }
      }
      if (gap === null || /[.?!]\s/u.test(gap)) {
        crossesSentence = true
        break
      }
    }
    if (crossesSentence) continue
    boundaries ??= graphemeBoundaries(text)
    const last = phrase[phrase.length - 1]
    const start = boundaries.get(first.byteOffset)
    const end = boundaries.get(last.byteOffset + last.byteLength)
    if (start === undefined || end === undefined || end < start) continue
    return { location: start, length: end - start }
  }
  return null
}

/** How many tokens a tokenizer finds in a text: FTS4's `matchinfo(…, 'l')` for one column. */
export const tokenCount = (text: string, tokenizer: Fts4Tokenizer) =>
  tokenize(text, tokenizer).length
